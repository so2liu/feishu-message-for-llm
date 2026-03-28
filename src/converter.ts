import { tmpdir } from "node:os";

import { FeishuApiClientImpl } from "./api-client.js";
import { getHandler } from "./handlers/index.js";
import type {
  ConvertResult,
  ConverterConfig,
  FeishuApiMessage,
  FeishuMessageEvent,
  HandlerContext,
  HandlerResult,
  Mention,
  MessageMetadata,
} from "./types.js";

const MAX_PARENT_DEPTH = 5;

interface SenderInfo {
  senderId: string;
  senderName: string;
  senderLabel: string;
  senderType: string;
}

interface InternalConvertResult {
  result: ConvertResult;
  bodyMarkdown: string;
}

export class FeishuMessageConverter {
  private readonly apiClient: FeishuApiClientImpl;
  private readonly downloadDir: string;
  private readonly maxFileSize?: number;

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

    this.apiClient = new FeishuApiClientImpl(config.appId, config.appSecret);
    this.downloadDir = config.downloadDir ?? tmpdir();
    this.maxFileSize = config.maxFileSize;
  }

  async convert(event: FeishuMessageEvent): Promise<ConvertResult> {
    const visitedIds = new Set<string>([event.message.message_id]);
    const result = await this.convertEventMessage(event, visitedIds, 0);

    return result.result;
  }

  private async convertEventMessage(
    event: FeishuMessageEvent,
    visitedIds: Set<string>,
    depth: number,
  ): Promise<InternalConvertResult> {
    const senderId = event.sender.sender_id.open_id;
    const rawContent = event.message.content;
    const { content, parseFailed } = this.parseContent(rawContent);
    const mentions = event.message.mentions ?? [];
    const handler = parseFailed
      ? getHandler("__unknown__")
      : getHandler(event.message.message_type);

    const [sender, parentMessage, handlerResult] = await Promise.all([
      this.resolveSenderInfo(senderId, event.sender.sender_type),
      event.message.parent_id
        ? this.resolveParentMessage(
            event.message.parent_id,
            visitedIds,
            depth,
            event.message.chat_type,
            event.message.thread_id,
          )
        : Promise.resolve(null),
      handler(
        content,
        this.createHandlerContext(
          mentions,
          event.message.message_id,
          event.message.message_type,
          depth,
        ),
      ),
    ]);

    const referenceBlock = event.message.parent_id
      ? this.renderReferenceBlock(
          event.message.parent_id,
          parentMessage?.result.metadata.senderName,
          parentMessage?.result.metadata.senderId,
          parentMessage?.bodyMarkdown,
        )
      : "";
    const bodyMarkdown = this.composeBodyMarkdown(referenceBlock, handlerResult.text);

    return {
      bodyMarkdown,
      result: {
        markdown: this.composeMarkdown(sender.senderLabel, bodyMarkdown),
        attachments: [
          ...(parentMessage?.result.attachments ?? []),
          ...handlerResult.attachments,
        ],
        metadata: this.createMetadata({
          messageId: event.message.message_id,
          messageType: event.message.message_type,
          chatId: event.message.chat_id,
          chatType: event.message.chat_type,
          sender,
          createTime: event.message.create_time,
          updateTime: event.message.update_time,
          rootId: event.message.root_id,
          parentId: event.message.parent_id,
          threadId: event.message.thread_id,
          mentions,
        }),
        rawContent,
        parentMessage: parentMessage?.result,
      },
    };
  }

  private async convertApiMessage(
    apiMessage: FeishuApiMessage,
    visitedIds: Set<string>,
    depth: number,
    chatType: "p2p" | "group",
    threadId?: string,
  ): Promise<InternalConvertResult> {
    const senderId = apiMessage.sender.id;
    const rawContent = apiMessage.body.content;
    const mentions = this.adaptApiMentions(apiMessage.mentions);
    const { content, parseFailed } = this.parseContent(rawContent);
    const messageType = apiMessage.msg_type;
    const handler = parseFailed
      ? getHandler("__unknown__")
      : getHandler(messageType);

    const [sender, parentMessage, handlerResult] = await Promise.all([
      this.resolveSenderInfo(senderId, apiMessage.sender.sender_type),
      apiMessage.parent_id
        ? this.resolveParentMessage(
            apiMessage.parent_id,
            visitedIds,
            depth,
            chatType,
            threadId,
          )
        : Promise.resolve(null),
      handler(
        content,
        this.createHandlerContext(
          mentions,
          apiMessage.message_id,
          messageType,
          depth,
        ),
      ),
    ]);

    const referenceBlock = apiMessage.parent_id
      ? this.renderReferenceBlock(
          apiMessage.parent_id,
          parentMessage?.result.metadata.senderName,
          parentMessage?.result.metadata.senderId,
          parentMessage?.bodyMarkdown,
        )
      : "";
    const bodyMarkdown = this.composeBodyMarkdown(referenceBlock, handlerResult.text);

    return {
      bodyMarkdown,
      result: {
        markdown: this.composeMarkdown(sender.senderLabel, bodyMarkdown),
        attachments: [
          ...(parentMessage?.result.attachments ?? []),
          ...handlerResult.attachments,
        ],
        metadata: this.createMetadata({
          messageId: apiMessage.message_id,
          messageType,
          chatId: apiMessage.chat_id,
          chatType,
          sender,
          createTime: apiMessage.create_time,
          updateTime: apiMessage.update_time,
          rootId: apiMessage.root_id,
          parentId: apiMessage.parent_id,
          threadId,
          mentions,
        }),
        rawContent,
        parentMessage: parentMessage?.result,
      },
    };
  }

  private async convertMessageBody(
    apiMessage: FeishuApiMessage,
    depth: number,
  ): Promise<HandlerResult> {
    const mentions = this.adaptApiMentions(apiMessage.mentions);
    const { content, parseFailed } = this.parseContent(apiMessage.body.content);
    const messageType = apiMessage.msg_type;
    const handler = parseFailed
      ? getHandler("__unknown__")
      : getHandler(messageType);

    return handler(
      content,
      this.createHandlerContext(
        mentions,
        apiMessage.message_id,
        messageType,
        depth,
      ),
    );
  }

  private createHandlerContext(
    mentions: Mention[],
    messageId: string,
    messageType: string,
    depth: number,
  ): HandlerContext {
    return {
      apiClient: this.apiClient,
      mentions,
      messageId,
      messageType,
      downloadDir: this.downloadDir,
      maxFileSize: this.maxFileSize,
      convertMessageBody: (apiMessage, nextDepth) =>
        this.convertMessageBody(apiMessage, nextDepth),
      depth,
    };
  }

  private async resolveParentMessage(
    parentId: string,
    visitedIds: Set<string>,
    depth: number,
    chatType: "p2p" | "group",
    threadId?: string,
  ): Promise<InternalConvertResult | null> {
    if (depth >= MAX_PARENT_DEPTH || visitedIds.has(parentId)) {
      return null;
    }

    visitedIds.add(parentId);

    try {
      const parentMessage = await this.apiClient.getMessage(parentId);

      return await this.convertApiMessage(
        parentMessage,
        visitedIds,
        depth + 1,
        chatType,
        threadId,
      );
    } catch {
      return null;
    }
  }

  private async resolveSenderInfo(
    openId: string,
    senderType: string,
  ): Promise<SenderInfo> {
    if (senderType !== "user") {
      return {
        senderId: openId,
        senderName: "应用",
        senderLabel: `应用(${openId})`,
        senderType,
      };
    }

    try {
      const { name } = await this.apiClient.getUserInfo(openId);

      return {
        senderId: openId,
        senderName: name,
        senderLabel: `${name}(${openId})`,
        senderType,
      };
    } catch {
      return {
        senderId: openId,
        senderName: "未知用户",
        senderLabel: `未知用户(${openId})`,
        senderType,
      };
    }
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
    chatType: "p2p" | "group";
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
