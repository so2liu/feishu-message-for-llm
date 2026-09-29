import { tmpdir } from "node:os";

import { FeishuApiClientImpl } from "./api-client.js";
import { getHandler } from "./handlers/index.js";
import type {
  ChatHistoryResult,
  ChatType,
  ConvertApiMessageOptions,
  ConvertResult,
  ConverterConfig,
  FeishuApiMessage,
  FeishuMessageEvent,
  FetchChatHistoryOptions,
  HandlerContext,
  HandlerResult,
  Mention,
  MessageMetadata,
} from "./types.js";

const DEFAULT_MAX_PARENT_DEPTH = 5;
const DEFAULT_HISTORY_PAGE_SIZE = 20;
const MAX_HISTORY_PAGE_SIZE = 50;
const RECALLED_MESSAGE_TEXT = "[消息已撤回]";

interface SenderInfo {
  senderId: string;
  senderName: string;
  senderLabel: string;
  senderType: string;
}

/** 统一事件消息和 API 消息后的消息结构 */
interface NormalizedMessage {
  messageId: string;
  messageType: string;
  rawContent: string;
  mentions: Mention[];
  senderId: string;
  senderType: string;
  chatId: string;
  createTime: string;
  updateTime: string;
  rootId?: string;
  parentId?: string;
  threadId?: string;
  deleted?: boolean;
}

/** 一次顶层转换内共享的上下文 */
interface ConvertScope {
  chatType: ChatType;
  visitedIds: Set<string>;
  /** 群成员 open_id → 名字，优先于通讯录接口 */
  memberNames?: Map<string, string>;
  /** 同一页历史消息，被引用时直接复用，不再调 getMessage */
  pageMessages?: Map<string, FeishuApiMessage>;
}

export class FeishuMessageConverter {
  private readonly apiClient: FeishuApiClientImpl;
  private readonly appId: string;
  private readonly downloadDir: string;
  private readonly maxFileSize?: number;
  private readonly downloadResources: boolean;
  private readonly maxParentDepth: number;

  constructor(config: ConverterConfig) {
    if (config.appId.trim().length === 0) {
      throw new Error("ConverterConfig.appId must not be empty");
    }

    if (config.appSecret.trim().length === 0) {
      throw new Error("ConverterConfig.appSecret must not be empty");
    }

    if (
      config.downloadDir !== undefined &&
      config.downloadDir.trim().length === 0
    ) {
      throw new Error("ConverterConfig.downloadDir must not be empty");
    }

    if (
      config.maxFileSize !== undefined &&
      (!Number.isFinite(config.maxFileSize) || config.maxFileSize <= 0)
    ) {
      throw new Error("ConverterConfig.maxFileSize must be a positive number");
    }

    if (
      config.maxParentDepth !== undefined &&
      (!Number.isInteger(config.maxParentDepth) || config.maxParentDepth < 0)
    ) {
      throw new Error("ConverterConfig.maxParentDepth must be a non-negative integer");
    }

    this.apiClient = new FeishuApiClientImpl(config.appId, config.appSecret);
    this.appId = config.appId;
    this.downloadDir = config.downloadDir ?? tmpdir();
    this.maxFileSize = config.maxFileSize;
    this.downloadResources = config.downloadResources ?? true;
    this.maxParentDepth = config.maxParentDepth ?? DEFAULT_MAX_PARENT_DEPTH;
  }

  async convert(event: FeishuMessageEvent): Promise<ConvertResult> {
    const { message, sender } = event;

    return this.convertMessage(
      {
        messageId: message.message_id,
        messageType: message.message_type,
        rawContent: message.content,
        mentions: message.mentions ?? [],
        senderId: sender.sender_id.open_id,
        senderType: sender.sender_type,
        chatId: message.chat_id,
        createTime: message.create_time,
        updateTime: message.update_time,
        rootId: message.root_id,
        parentId: message.parent_id,
        threadId: message.thread_id,
      },
      {
        chatType: message.chat_type,
        visitedIds: new Set([message.message_id]),
      },
      0,
    );
  }

  /** 转换 im/v1 消息接口返回的单条消息 */
  async convertApiMessage(
    message: FeishuApiMessage,
    options: ConvertApiMessageOptions = {},
  ): Promise<ConvertResult> {
    return this.convertMessage(
      this.normalizeApiMessage(message),
      {
        chatType: options.chatType ?? "group",
        visitedIds: new Set([message.message_id]),
      },
      0,
    );
  }

  /** 拉取群聊历史消息并转换，结果按时间升序排列 */
  async fetchChatHistory(
    chatId: string,
    options: FetchChatHistoryOptions = {},
  ): Promise<ChatHistoryResult> {
    const pageSize = options.pageSize ?? DEFAULT_HISTORY_PAGE_SIZE;

    if (!Number.isInteger(pageSize) || pageSize <= 0) {
      throw new Error("fetchChatHistory pageSize must be a positive integer");
    }

    const chatType = options.chatType ?? "group";

    // 群里多半有本机器人的回复，提前并行拿机器人名字（成功后常驻缓存，只请求一次）
    this.apiClient.getBotName().catch(() => undefined);

    const [page, memberNames] = await Promise.all([
      this.apiClient.listChatMessages(chatId, {
        pageSize: Math.min(pageSize, MAX_HISTORY_PAGE_SIZE),
        pageToken: options.pageToken,
        startTime: options.startTime,
        endTime: options.endTime,
      }),
      chatType === "group"
        ? this.apiClient
            .getChatMemberNames(chatId)
            .catch(() => new Map<string, string>())
        : Promise.resolve(new Map<string, string>()),
    ]);
    const pageMessages = new Map(
      page.items.map((item) => [item.message_id, item]),
    );
    const ascendingItems = [...page.items].sort(
      (left, right) => Number(left.create_time) - Number(right.create_time),
    );
    const messages = await Promise.all(
      ascendingItems.map((item) =>
        this.convertMessage(
          this.normalizeApiMessage(item),
          {
            chatType,
            visitedIds: new Set([item.message_id]),
            memberNames,
            pageMessages,
          },
          0,
        ),
      ),
    );

    return {
      messages,
      nextPageToken: page.hasMore ? page.pageToken : undefined,
      hasMore: page.hasMore,
    };
  }

  private async convertMessage(
    message: NormalizedMessage,
    scope: ConvertScope,
    depth: number,
  ): Promise<ConvertResult> {
    const [sender, parentMessage, handlerResult] = await Promise.all([
      this.resolveSenderInfo(message.senderId, message.senderType, scope),
      message.parentId && !message.deleted
        ? this.resolveParentMessage(message.parentId, scope, depth, message.threadId)
        : Promise.resolve(null),
      message.deleted
        ? Promise.resolve<HandlerResult>({
            text: RECALLED_MESSAGE_TEXT,
            attachments: [],
          })
        : this.runHandler(message, scope, depth),
    ]);

    const referenceBlock = message.parentId && !message.deleted
      ? this.renderReferenceBlock(
          message.parentId,
          parentMessage?.metadata.senderName,
          parentMessage?.metadata.senderId,
          parentMessage?.bodyMarkdown,
        )
      : "";
    const bodyMarkdown = this.composeBodyMarkdown(referenceBlock, handlerResult.text);

    return {
      markdown: this.composeMarkdown(sender.senderLabel, bodyMarkdown),
      bodyMarkdown,
      attachments: [
        ...(parentMessage?.attachments ?? []),
        ...handlerResult.attachments,
      ],
      metadata: this.createMetadata({
        messageId: message.messageId,
        messageType: message.messageType,
        chatId: message.chatId,
        chatType: scope.chatType,
        sender,
        createTime: message.createTime,
        updateTime: message.updateTime,
        rootId: message.rootId,
        parentId: message.parentId,
        threadId: message.threadId,
        mentions: message.mentions,
      }),
      rawContent: message.rawContent,
      parentMessage: parentMessage ?? undefined,
    };
  }

  private runHandler(
    message: Pick<NormalizedMessage, "messageId" | "messageType" | "rawContent" | "mentions">,
    scope: ConvertScope,
    depth: number,
  ): Promise<HandlerResult> {
    const { content, parseFailed } = this.parseContent(message.rawContent);
    const handler = parseFailed
      ? getHandler("__unknown__")
      : getHandler(message.messageType);

    return handler(
      content,
      this.createHandlerContext(
        message.mentions,
        message.messageId,
        message.messageType,
        scope,
        depth,
      ),
    );
  }

  private async convertMessageBody(
    apiMessage: FeishuApiMessage,
    scope: ConvertScope,
    depth: number,
  ): Promise<HandlerResult> {
    if (apiMessage.deleted) {
      return { text: RECALLED_MESSAGE_TEXT, attachments: [] };
    }

    return this.runHandler(this.normalizeApiMessage(apiMessage), scope, depth);
  }

  private createHandlerContext(
    mentions: Mention[],
    messageId: string,
    messageType: string,
    scope: ConvertScope,
    depth: number,
  ): HandlerContext {
    return {
      apiClient: this.apiClient,
      mentions,
      messageId,
      messageType,
      downloadDir: this.downloadDir,
      maxFileSize: this.maxFileSize,
      downloadResources: this.downloadResources,
      resolveSenderLabel: async (apiMessage) =>
        (
          await this.resolveSenderInfo(
            apiMessage.sender.id,
            apiMessage.sender.sender_type,
            scope,
          )
        ).senderLabel,
      convertMessageBody: (apiMessage, nextDepth) =>
        this.convertMessageBody(apiMessage, scope, nextDepth),
      depth,
    };
  }

  private async resolveParentMessage(
    parentId: string,
    scope: ConvertScope,
    depth: number,
    threadId?: string,
  ): Promise<ConvertResult | null> {
    if (depth >= this.maxParentDepth || scope.visitedIds.has(parentId)) {
      return null;
    }

    scope.visitedIds.add(parentId);

    try {
      const parentMessage =
        scope.pageMessages?.get(parentId) ??
        (await this.apiClient.getMessage(parentId));
      const normalized = this.normalizeApiMessage(parentMessage);

      return await this.convertMessage(
        { ...normalized, threadId: normalized.threadId ?? threadId },
        scope,
        depth + 1,
      );
    } catch {
      return null;
    }
  }

  private async resolveSenderInfo(
    senderId: string,
    senderType: string,
    scope: ConvertScope,
  ): Promise<SenderInfo> {
    // 消息接口返回的 system 消息（如「某人邀请了某人入群」）没有发送人
    if (senderId.length === 0) {
      return {
        senderId,
        senderName: "系统",
        senderLabel: "系统",
        senderType,
      };
    }

    if (senderType !== "user") {
      const botName =
        senderType === "app" && senderId === this.appId
          ? await this.apiClient.getBotName().catch(() => null)
          : null;
      const senderName = botName ?? "应用";

      return {
        senderId,
        senderName,
        senderLabel: `${senderName}(${senderId})`,
        senderType,
      };
    }

    const memberName = scope.memberNames?.get(senderId);

    if (memberName) {
      return {
        senderId,
        senderName: memberName,
        senderLabel: `${memberName}(${senderId})`,
        senderType,
      };
    }

    try {
      const { name } = await this.apiClient.getUserInfo(senderId);

      return {
        senderId,
        senderName: name,
        senderLabel: `${name}(${senderId})`,
        senderType,
      };
    } catch {
      return {
        senderId,
        senderName: "未知用户",
        senderLabel: `未知用户(${senderId})`,
        senderType,
      };
    }
  }

  private normalizeApiMessage(apiMessage: FeishuApiMessage): NormalizedMessage {
    return {
      messageId: apiMessage.message_id,
      messageType: apiMessage.msg_type,
      rawContent: apiMessage.body?.content ?? "",
      mentions: this.adaptApiMentions(apiMessage.mentions),
      senderId: apiMessage.sender.id,
      senderType: apiMessage.sender.sender_type,
      chatId: apiMessage.chat_id,
      createTime: apiMessage.create_time,
      updateTime: apiMessage.update_time,
      rootId: apiMessage.root_id,
      parentId: apiMessage.parent_id,
      threadId: apiMessage.thread_id,
      deleted: apiMessage.deleted === true,
    };
  }

  private parseContent(rawContent: string): {
    content: unknown;
    parseFailed: boolean;
  } {
    try {
      return {
        content: JSON.parse(rawContent) as unknown,
        parseFailed: false,
      };
    } catch {
      return {
        content: rawContent,
        parseFailed: true,
      };
    }
  }

  private adaptApiMentions(
    mentions: FeishuApiMessage["mentions"],
  ): Mention[] {
    return (mentions ?? []).map((mention) => ({
      key: mention.key,
      id: {
        union_id: "",
        user_id: "",
        // API 消息的 id 是字符串：用户为 open_id，机器人为 app_id
        open_id: mention.id,
      },
      name: mention.name,
      tenant_key: mention.tenant_key,
    }));
  }

  private renderReferenceBlock(
    parentId: string,
    senderName?: string,
    senderId?: string,
    bodyMarkdown?: string,
  ): string {
    if (!senderName || !senderId || !bodyMarkdown) {
      return `> 回复消息(parent_id: ${parentId})`;
    }

    const quotedBody = bodyMarkdown
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");

    return `> 回复 **${senderName}(${senderId})** 的消息：\n${quotedBody}`;
  }

  private composeBodyMarkdown(referenceBlock: string, text: string): string {
    return [referenceBlock, text].filter((part) => part.length > 0).join("\n\n");
  }

  private composeMarkdown(senderLabel: string, bodyMarkdown: string): string {
    return bodyMarkdown.length > 0
      ? `**${senderLabel}：**\n\n${bodyMarkdown}`
      : `**${senderLabel}：**`;
  }

  private createMetadata(input: {
    messageId: string;
    messageType: string;
    chatId: string;
    chatType: ChatType;
    sender: SenderInfo;
    createTime: string;
    updateTime: string;
    rootId?: string;
    parentId?: string;
    threadId?: string;
    mentions: Mention[];
  }): MessageMetadata {
    return {
      messageId: input.messageId,
      messageType: input.messageType,
      chatId: input.chatId,
      chatType: input.chatType,
      senderId: input.sender.senderId,
      senderName: input.sender.senderName,
      senderType: input.sender.senderType,
      createTime: input.createTime,
      updateTime: input.updateTime,
      rootId: input.rootId,
      parentId: input.parentId,
      threadId: input.threadId,
      mentions: input.mentions.map((mention) => ({
        name: mention.name,
        openId: mention.id.open_id,
      })),
    };
  }
}
