import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { FeishuMessageConverter } from "../../src/index.js";
import type {
  ConverterConfig,
  FeishuApiMessage,
  FeishuMessageEvent,
  Mention,
} from "../../src/types.js";

interface HarnessState {
  userNames: Record<string, string>;
  failedUsers: Set<string>;
  chatNames: Record<string, string>;
  messages: Record<string, FeishuApiMessage>;
  mergeForwardMessages: Record<string, FeishuApiMessage[]>;
  resources: Map<string, BodyInit>;
  historyItems: FeishuApiMessage[];
  chatMembers: Record<string, string>;
  botName?: string;
}

interface EventOptions {
  messageId?: string;
  messageType?: string;
  content?: string;
  mentions?: Mention[];
  senderOpenId?: string;
  senderType?: string;
  parentId?: string;
  rootId?: string;
  threadId?: string;
  chatId?: string;
  chatType?: "p2p" | "group";
  createTime?: string;
  updateTime?: string;
}

interface ApiMessageOptions {
  messageId?: string;
  messageType?: string;
  content?: string;
  mentions?: FeishuApiMessage["mentions"];
  senderOpenId?: string;
  senderType?: string;
  parentId?: string;
  rootId?: string;
  chatId?: string;
  createTime?: string;
  updateTime?: string;
  deleted?: boolean;
}

const tempDirs: string[] = [];

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
}

function resourceId(messageId: string, fileKey: string): string {
  return `${messageId}:${fileKey}`;
}

function createMention(
  key: string,
  openId: string,
  name: string,
): Mention {
  return {
    key,
    id: {
      union_id: `on_${openId}`,
      user_id: `u_${openId}`,
      open_id: openId,
    },
    name,
    tenant_key: "tenant_key",
  };
}

function createApiMention(
  key: string,
  openId: string,
  name: string,
): NonNullable<FeishuApiMessage["mentions"]>[number] {
  return {
    key,
    id: openId,
    name,
    tenant_key: "tenant_key",
  };
}

function createEvent(options: EventOptions = {}): FeishuMessageEvent {
  return {
    sender: {
      sender_id: {
        union_id: `on_${options.senderOpenId ?? "ou_sender"}`,
        user_id: `u_${options.senderOpenId ?? "ou_sender"}`,
        open_id: options.senderOpenId ?? "ou_sender",
      },
      sender_type: options.senderType ?? "user",
      tenant_key: "tenant_key",
    },
    message: {
      message_id: options.messageId ?? "om_message_123",
      root_id: options.rootId,
      parent_id: options.parentId,
      create_time: options.createTime ?? "1710000000000",
      update_time: options.updateTime ?? "1710000000000",
      chat_id: options.chatId ?? "oc_test_chat",
      thread_id: options.threadId,
      chat_type: options.chatType ?? "group",
      message_type: options.messageType ?? "text",
      content: options.content ?? '{"text":"default"}',
      mentions: options.mentions ?? [],
      user_agent: "Vitest",
    },
  };
}

function createApiMessage(options: ApiMessageOptions = {}): FeishuApiMessage {
  return {
    message_id: options.messageId ?? "om_api_message_123",
    root_id: options.rootId,
    parent_id: options.parentId,
    msg_type: options.messageType ?? "text",
    create_time: options.createTime ?? "1710000000000",
    update_time: options.updateTime ?? "1710000000000",
    chat_id: options.chatId ?? "oc_test_chat",
    sender: {
      id: options.senderOpenId ?? "ou_api_sender",
      id_type: "open_id",
      sender_type: options.senderType ?? "user",
      tenant_key: "tenant_key",
    },
    body: {
      content: options.content ?? '{"text":"default"}',
    },
    mentions: options.mentions,
    deleted: options.deleted,
  };
}

function createFetchMock(state: HarnessState) {
  return vi.fn(async (input: string | URL | Request) => {
    const urlStr =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const url = new URL(urlStr);

    if (url.pathname.endsWith("/auth/v3/tenant_access_token/internal")) {
      return jsonResponse({
        code: 0,
        msg: "ok",
        tenant_access_token: "test_token",
        expire: 7200,
      });
    }

    if (url.pathname.includes("/resources/")) {
      const parts = url.pathname.split("/");
      const messageId = decodeURIComponent(parts[parts.indexOf("messages") + 1] ?? "");
      const fileKey = decodeURIComponent(parts[parts.indexOf("resources") + 1] ?? "");
      const body = state.resources.get(resourceId(messageId, fileKey));

      if (!body) {
        return new Response("resource not found", { status: 404 });
      }

      return new Response(body, { status: 200 });
    }

    if (url.pathname.endsWith("/bot/v3/info")) {
      return state.botName
        ? jsonResponse({ code: 0, msg: "ok", bot: { app_name: state.botName } })
        : jsonResponse({ code: 9999, msg: "bot info failed" });
    }

    if (url.pathname.endsWith("/im/v1/messages")) {
      return jsonResponse({
        code: 0,
        msg: "ok",
        data: { items: state.historyItems, has_more: true, page_token: "next_page" },
      });
    }

    if (/\/im\/v1\/chats\/[^/]+\/members$/.test(url.pathname)) {
      return jsonResponse({
        code: 0,
        msg: "ok",
        data: {
          items: Object.entries(state.chatMembers).map(([memberId, name]) => ({
            member_id: memberId,
            name,
          })),
          has_more: false,
        },
      });
    }

    if (url.pathname.includes("/contact/v3/users/")) {
      const openId = decodeURIComponent(url.pathname.split("/users/")[1] ?? "");

      if (state.failedUsers.has(openId)) {
        return jsonResponse({
          code: 9999,
          msg: "user lookup failed",
          data: {},
        });
      }

      return jsonResponse({
        code: 0,
        msg: "ok",
        data: {
          user: {
            name: state.userNames[openId] ?? "未知",
          },
        },
      });
    }

    if (url.pathname.includes("/im/v1/chats/")) {
      const chatId = decodeURIComponent(url.pathname.split("/chats/")[1] ?? "");
      const chatName = state.chatNames[chatId];

      if (!chatName) {
        return jsonResponse({
          code: 9999,
          msg: "chat lookup failed",
          data: {},
        });
      }

      return jsonResponse({
        code: 0,
        msg: "ok",
        data: {
          chat: {
            name: chatName,
          },
        },
      });
    }

    if (/\/im\/v1\/messages\/[^/]+$/.test(url.pathname)) {
      const messageId = decodeURIComponent(url.pathname.split("/messages/")[1] ?? "");

      return jsonResponse({
        code: 0,
        msg: "ok",
        data: {
          items: state.mergeForwardMessages[messageId]
            ?? (state.messages[messageId] ? [state.messages[messageId]] : []),
        },
      });
    }

    return new Response("not found", { status: 404 });
  });
}

async function createHarness(
  seed?: Partial<HarnessState>,
  config?: Partial<ConverterConfig>,
) {
  const downloadDir = await mkdtemp(join(tmpdir(), "feishu-converter-e2e-"));
  tempDirs.push(downloadDir);

  const state: HarnessState = {
    userNames: seed?.userNames ?? {},
    failedUsers: seed?.failedUsers ?? new Set<string>(),
    chatNames: seed?.chatNames ?? {},
    messages: seed?.messages ?? {},
    mergeForwardMessages: seed?.mergeForwardMessages ?? {},
    resources: seed?.resources ?? new Map<string, BodyInit>(),
    historyItems: seed?.historyItems ?? [],
    chatMembers: seed?.chatMembers ?? {},
    botName: seed?.botName,
  };

  const mockFetch = createFetchMock(state);
  vi.stubGlobal("fetch", mockFetch);

  return {
    converter: new FeishuMessageConverter({
      appId: "cli_test",
      appSecret: "secret_test",
      downloadDir,
      ...config,
    }),
    downloadDir,
    mockFetch,
    state,
  };
}

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();

  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("FeishuMessageConverter E2E", () => {
  it("rejects invalid converter configuration", () => {
    expect(
      () =>
        new FeishuMessageConverter({
          appId: "cli_test",
          appSecret: "secret_test",
          maxFileSize: 0,
        }),
    ).toThrow("ConverterConfig.maxFileSize must be a positive number");
  });

  describe("文本消息", () => {
    it("场景 1：简单文本消息包含发送者和正文", async () => {
      const { converter } = await createHarness({
        userNames: {
          ou_sender: "张三",
        },
      });
      const event = createEvent({
        messageId: "om_text_simple",
        senderOpenId: "ou_sender",
        content: '{"text":"今天下午开会"}',
      });

      const result = await converter.convert(event);

      expect(result.markdown).toBe("**张三(ou_sender)：**\n\n今天下午开会");
      expect(result.attachments).toEqual([]);
      expect(result.rawContent).toBe('{"text":"今天下午开会"}');
    });

    it("场景 2：带 @ 提及的文本会替换为用户名和 open_id", async () => {
      const { converter } = await createHarness({
        userNames: {
          ou_sender: "张三",
        },
      });
      const event = createEvent({
        messageId: "om_text_mentions",
        senderOpenId: "ou_sender",
        content: '{"text":"@_user_1 你看一下这个 bug，cc @_user_2"}',
        mentions: [
          createMention("@_user_1", "ou_user_1", "李四"),
          createMention("@_user_2", "ou_user_2", "王五"),
        ],
      });

      const result = await converter.convert(event);

      expect(result.markdown).toBe(
        "**张三(ou_sender)：**\n\n@李四(ou_user_1) 你看一下这个 bug，cc @王五(ou_user_2)",
      );
      expect(result.metadata.mentions).toEqual([
        { name: "李四", openId: "ou_user_1" },
        { name: "王五", openId: "ou_user_2" },
      ]);
    });
  });

  describe("富文本和附件消息", () => {
    it("场景 3：富文本消息保留标题、样式、链接和 @ 提及", async () => {
      const { converter } = await createHarness({
        userNames: {
          ou_sender: "张三",
        },
      });
      const event = createEvent({
        messageId: "om_post_rich",
        messageType: "post",
        senderOpenId: "ou_sender",
        content: JSON.stringify({
          title: "项目周报",
          content: [
            [
              { tag: "text", text: "本周完成了 ", style: [] },
              { tag: "text", text: "核心功能", style: ["bold"] },
              { tag: "text", text: " 的开发，详见 ", style: [] },
              {
                tag: "a",
                text: "设计文档",
                href: "https://example.com/spec",
                style: [],
              },
            ],
            [
              { tag: "at", user_id: "@_user_1", user_name: "李四" },
              { tag: "text", text: " 请 review 一下", style: [] },
            ],
          ],
        }),
        mentions: [createMention("@_user_1", "ou_user_1", "李四")],
      });

      const result = await converter.convert(event);

      expect(result.markdown).toBe(
        "**张三(ou_sender)：**\n\n### 项目周报\n\n本周完成了 **核心功能** 的开发，详见 [设计文档](https://example.com/spec)\n@李四(ou_user_1) 请 review 一下",
      );
      expect(result.attachments).toEqual([]);
    });

    it("场景 4：图片消息会下载图片并返回附件", async () => {
      const { converter, downloadDir, state } = await createHarness({
        userNames: {
          ou_sender: "张三",
        },
      });
      const filePath = join(downloadDir, "om_image", "img_v2_abc123.png");
      state.resources.set(
        resourceId("om_image", "img_v2_abc123"),
        Buffer.from("fake-image-content"),
      );
      const event = createEvent({
        messageId: "om_image",
        messageType: "image",
        senderOpenId: "ou_sender",
        content: '{"image_key":"img_v2_abc123"}',
      });

      const result = await converter.convert(event);

      expect(result.markdown).toBe(`**张三(ou_sender)：**\n\n![图片](${filePath})`);
      expect(result.attachments).toEqual([
        {
          type: "image",
          filePath,
          mimeType: "image/png",
        },
      ]);
      await expect(readFile(filePath, "utf8")).resolves.toBe("fake-image-content");
    });

    it("场景 5：文本文件消息会下载并自动读取内容", async () => {
      const { converter, downloadDir, state } = await createHarness({
        userNames: {
          ou_sender: "张三",
        },
      });
      const filePath = join(downloadDir, "om_file_text", "error.log");
      state.resources.set(
        resourceId("om_file_text", "file_text_1"),
        "2024-01-01 10:00:00 ERROR Connection timeout\n2024-01-01 10:00:01 ERROR Retry failed",
      );
      const event = createEvent({
        messageId: "om_file_text",
        messageType: "file",
        senderOpenId: "ou_sender",
        content: '{"file_key":"file_text_1","file_name":"error.log"}',
      });

      const result = await converter.convert(event);

      expect(result.markdown).toBe(
        `**张三(ou_sender)：**\n\n[文件: error.log](${filePath})\n\n<error.log 内容>\n\`\`\`log\n2024-01-01 10:00:00 ERROR Connection timeout\n2024-01-01 10:00:01 ERROR Retry failed\n\`\`\`\n</error.log 内容>`,
      );
      expect(result.attachments).toEqual([
        {
          type: "file",
          filePath,
          fileName: "error.log",
        },
      ]);
      await expect(readFile(filePath, "utf8")).resolves.toContain("Connection timeout");
    });

    it("场景 6：音频消息会格式化时长并下载文件", async () => {
      const { converter, downloadDir, state } = await createHarness({
        userNames: {
          ou_sender: "张三",
        },
      });
      const filePath = join(downloadDir, "om_audio", "audio_key_1.opus");
      state.resources.set(resourceId("om_audio", "audio_key_1"), "audio-bytes");
      const event = createEvent({
        messageId: "om_audio",
        messageType: "audio",
        senderOpenId: "ou_sender",
        content: '{"file_key":"audio_key_1","duration":4500}',
      });

      const result = await converter.convert(event);

      expect(result.markdown).toBe(
        `**张三(ou_sender)：**\n\n[语音消息, 时长: 4.5秒](${filePath})`,
      );
      expect(result.attachments).toEqual([
        {
          type: "audio",
          filePath,
        },
      ]);
      await expect(readFile(filePath, "utf8")).resolves.toBe("audio-bytes");
    });
  });

  describe("回复和合并转发", () => {
    it("场景 7：回复文本消息会引用父消息并保留父消息中的 @ 提及", async () => {
      const parentId = "om_parent_text";
      const { converter } = await createHarness({
        userNames: {
          ou_reply_sender: "当前发送者",
          ou_parent_sender: "父消息发送者",
        },
        messages: {
          [parentId]: createApiMessage({
            messageId: parentId,
            senderOpenId: "ou_parent_sender",
            content: '{"text":"@_user_1 请跟进"}',
            mentions: [createApiMention("@_user_1", "ou_user_1", "李四")],
          }),
        },
      });
      const event = createEvent({
        messageId: "om_reply_text",
        senderOpenId: "ou_reply_sender",
        messageType: "text",
        parentId,
        content: '{"text":"收到"}',
      });

      const result = await converter.convert(event);

      expect(result.markdown).toBe(
        "**当前发送者(ou_reply_sender)：**\n\n> 回复 **父消息发送者(ou_parent_sender)** 的消息：\n> @李四(ou_user_1) 请跟进\n\n收到",
      );
      expect(result.parentMessage?.markdown).toBe(
        "**父消息发送者(ou_parent_sender)：**\n\n@李四(ou_user_1) 请跟进",
      );
    });

    it("场景 8：回复文件消息会在引用块中展示父文件信息", async () => {
      const parentId = "om_parent_file";
      const { converter, downloadDir, state } = await createHarness({
        userNames: {
          ou_reply_sender: "当前发送者",
          ou_parent_sender: "父文件发送者",
        },
        messages: {
          [parentId]: createApiMessage({
            messageId: parentId,
            messageType: "file",
            senderOpenId: "ou_parent_sender",
            content: '{"file_key":"parent_file_key","file_name":"spec.pdf"}',
          }),
        },
      });
      const parentFilePath = join(downloadDir, parentId, "spec.pdf");
      state.resources.set(resourceId(parentId, "parent_file_key"), Buffer.from("pdf"));
      const event = createEvent({
        messageId: "om_reply_file",
        senderOpenId: "ou_reply_sender",
        parentId,
        content: '{"text":"看到了"}',
      });

      const result = await converter.convert(event);

      expect(result.markdown).toBe(
        `**当前发送者(ou_reply_sender)：**\n\n> 回复 **父文件发送者(ou_parent_sender)** 的消息：\n> [文件: spec.pdf](${parentFilePath})\n\n看到了`,
      );
      expect(result.attachments).toEqual([
        {
          type: "file",
          filePath: parentFilePath,
          fileName: "spec.pdf",
        },
      ]);
      await expect(readFile(parentFilePath, "utf8")).resolves.toBe("pdf");
    });

    it("场景 9：合并转发消息会递归处理子消息并输出引用块格式", async () => {
      const mergeMessageId = "om_merge_forward";
      const { converter } = await createHarness({
        userNames: {
          ou_sender: "张三",
          ou_child_1: "李四",
          ou_child_2: "王五",
        },
        mergeForwardMessages: {
          [mergeMessageId]: [
            createApiMessage({
              messageId: "om_child_1",
              senderOpenId: "ou_child_1",
              content: '{"text":"第一条 @_user_1"}',
              mentions: [createApiMention("@_user_1", "ou_user_1", "赵六")],
            }),
            createApiMessage({
              messageId: "om_child_2",
              messageType: "post",
              senderOpenId: "ou_child_2",
              content: JSON.stringify({
                title: "子标题",
                content: [[{ tag: "text", text: "第二条正文", style: ["bold"] }]],
              }),
            }),
          ],
        },
      });
      const event = createEvent({
        messageId: mergeMessageId,
        messageType: "merge_forward",
        senderOpenId: "ou_sender",
        content: '{"text":"[合并转发]"}',
      });

      const result = await converter.convert(event);

      expect(result.markdown).toBe(
        "**张三(ou_sender)：**\n\n> **合并转发消息：**\n> **李四(ou_child_1)：** 第一条 @赵六(ou_user_1)\n> **王五(ou_child_2)：** ### 子标题\n> \n> **第二条正文**",
      );
      expect(result.attachments).toEqual([]);
    });
  });

  describe("分享和位置消息", () => {
    it("场景 10：分享群聊消息会获取群名和 chat_id", async () => {
      const { converter } = await createHarness({
        userNames: {
          ou_sender: "张三",
        },
        chatNames: {
          oc_group_123: "研发讨论群",
        },
      });
      const event = createEvent({
        messageId: "om_share_chat",
        messageType: "share_chat",
        senderOpenId: "ou_sender",
        content: '{"chat_id":"oc_group_123"}',
      });

      const result = await converter.convert(event);

      expect(result.markdown).toBe(
        "**张三(ou_sender)：**\n\n[分享群聊: 研发讨论群(oc_group_123)]",
      );
    });

    it("场景 11：分享用户消息会获取用户名和 open_id", async () => {
      const { converter } = await createHarness({
        userNames: {
          ou_sender: "张三",
          ou_shared_user: "李四",
        },
      });
      const event = createEvent({
        messageId: "om_share_user",
        messageType: "share_user",
        senderOpenId: "ou_sender",
        content: '{"user_id":"ou_shared_user"}',
      });

      const result = await converter.convert(event);

      expect(result.markdown).toBe(
        "**张三(ou_sender)：**\n\n[分享用户: 李四(ou_shared_user)]",
      );
    });

    it("场景 12：位置消息会输出完整位置信息", async () => {
      const { converter } = await createHarness({
        userNames: {
          ou_sender: "张三",
        },
      });
      const event = createEvent({
        messageId: "om_location",
        messageType: "location",
        senderOpenId: "ou_sender",
        content: '{"name":"上海中心","longitude":"121.4998","latitude":"31.2397"}',
      });

      const result = await converter.convert(event);

      expect(result.markdown).toBe(
        "**张三(ou_sender)：**\n\n[位置: 上海中心, 经度: 121.4998, 纬度: 31.2397]",
      );
    });
  });

  describe("降级和兜底", () => {
    it("场景 13：未知消息类型会输出兜底文本并保留 rawContent", async () => {
      const { converter } = await createHarness({
        userNames: {
          ou_sender: "张三",
        },
      });
      const rawContent = '{"foo":"bar","baz":1}';
      const event = createEvent({
        messageId: "om_unknown",
        messageType: "mystery_type",
        senderOpenId: "ou_sender",
        content: rawContent,
      });

      const result = await converter.convert(event);

      expect(result.markdown).toBe("**张三(ou_sender)：**\n\n[不支持的消息类型: mystery_type]");
      expect(result.rawContent).toBe(rawContent);
    });

    it("场景 14：非法 content JSON 会降级为未知类型处理", async () => {
      const { converter } = await createHarness({
        userNames: {
          ou_sender: "张三",
        },
      });
      const rawContent = '{"text":"broken"';
      const event = createEvent({
        messageId: "om_invalid_content",
        messageType: "text",
        senderOpenId: "ou_sender",
        content: rawContent,
      });

      const result = await converter.convert(event);

      expect(result.markdown).toBe("**张三(ou_sender)：**\n\n[不支持的消息类型: text]");
      expect(result.rawContent).toBe(rawContent);
    });

    it("场景 15：用户名 API 失败时发送者降级为未知用户(open_id)", async () => {
      const failedUsers = new Set(["ou_missing_user"]);
      const { converter } = await createHarness({
        failedUsers,
      });
      const event = createEvent({
        messageId: "om_user_fallback",
        senderOpenId: "ou_missing_user",
        content: '{"text":"名字接口挂了"}',
      });

      const result = await converter.convert(event);

      expect(result.markdown).toBe("**未知用户(ou_missing_user)：**\n\n名字接口挂了");
      expect(result.metadata.senderName).toBe("未知用户");
    });

    it("补充场景：文件夹消息输出可读描述", async () => {
      const { converter } = await createHarness({
        userNames: {
          ou_sender: "张三",
        },
      });
      const event = createEvent({
        messageId: "om_folder",
        messageType: "folder",
        senderOpenId: "ou_sender",
        content: '{"file_name":"设计资料"}',
      });

      const result = await converter.convert(event);

      expect(result.markdown).toBe("**张三(ou_sender)：**\n\n[文件夹: 设计资料]");
    });

    it("补充场景：bot 发送者使用应用(open_id)格式", async () => {
      const { converter } = await createHarness();
      const event = createEvent({
        messageId: "om_bot_sender",
        senderOpenId: "ou_bot",
        senderType: "bot",
        content: '{"text":"机器人提醒"}',
      });

      const result = await converter.convert(event);

      expect(result.markdown).toBe("**应用(ou_bot)：**\n\n机器人提醒");
      expect(result.metadata.senderType).toBe("bot");
    });
  });

  describe("关闭资源下载", () => {
    it("所有资源类消息只输出占位文本，不发下载请求、不创建目录", async () => {
      const parentMessage = createApiMessage({
        messageId: "om_parent_media",
        messageType: "media",
        senderOpenId: "ou_parent",
        content: '{"file_key":"file_video","image_key":"img_cover","file_name":"演示.mp4","duration":30000}',
      });
      const { converter, downloadDir, mockFetch } = await createHarness(
        {
          userNames: { ou_sender: "张三", ou_parent: "李四" },
          messages: { om_parent_media: parentMessage },
        },
        { downloadResources: false },
      );
      const cases: Array<[string, string, string]> = [
        ["image", '{"image_key":"img_1"}', "[图片]"],
        ["file", '{"file_key":"file_1","file_name":"error.log"}', "[文件: error.log]"],
        ["audio", '{"file_key":"file_audio","duration":5000}', "[语音消息, 时长: 5秒]"],
        ["sticker", '{"file_key":"file_sticker"}', "[贴纸]"],
        [
          "post",
          '{"title":"","content":[[{"tag":"img","image_key":"img_post"}]]}',
          "[图片]",
        ],
      ];

      for (const [messageType, content, expected] of cases) {
        const result = await converter.convert(
          createEvent({ messageId: `om_${messageType}`, messageType, content }),
        );

        expect(result.bodyMarkdown).toBe(expected);
        expect(result.attachments).toEqual([]);
      }

      const reply = await converter.convert(
        createEvent({
          messageId: "om_reply_media",
          parentId: "om_parent_media",
          content: '{"text":"看这个"}',
        }),
      );

      expect(reply.bodyMarkdown).toBe(
        "> 回复 **李四(ou_parent)** 的消息：\n> [视频: 演示.mp4, 时长: 30秒]\n\n看这个",
      );
      expect(reply.attachments).toEqual([]);

      const requestedUrls = mockFetch.mock.calls.map(([input]) => String(input));

      expect(requestedUrls.some((url) => url.includes("/resources/"))).toBe(false);
      expect(await readdir(downloadDir)).toEqual([]);
    });
  });

  describe("fetchChatHistory", () => {
    it("按时间升序输出，页内引用不调 getMessage，页外引用受深度限制", async () => {
      const botAppId = "cli_test";
      const historyItems = [
        createApiMessage({
          messageId: "om_4",
          createTime: "1710000004000",
          senderOpenId: "ou_b",
          parentId: "om_outside",
          content: '{"text":"回复页外消息"}',
        }),
        createApiMessage({
          messageId: "om_3",
          createTime: "1710000003000",
          senderOpenId: "ou_a",
          deleted: true,
          content: '{"text":"This message was recalled"}',
        }),
        createApiMessage({
          messageId: "om_2",
          createTime: "1710000002000",
          senderOpenId: botAppId,
          senderType: "app",
          parentId: "om_1",
          messageType: "post",
          content: '{"title":"","content":[[{"tag":"text","text":"收到"}]]}',
        }),
        createApiMessage({
          messageId: "om_1",
          createTime: "1710000001000",
          senderOpenId: "ou_a",
          content: '{"text":"@_user_1 帮我看看"}',
          mentions: [
            { key: "@_user_1", id: botAppId, id_type: "app_id", name: "Blade Agent", tenant_key: "t" },
          ],
        }),
      ];
      const { converter, mockFetch } = await createHarness(
        {
          historyItems,
          chatMembers: { ou_a: "张三", ou_b: "李四" },
          botName: "Blade Agent",
          messages: {
            om_outside: createApiMessage({
              messageId: "om_outside",
              senderOpenId: "ou_a",
              parentId: "om_older",
              content: '{"text":"页外消息"}',
            }),
          },
        },
        { maxParentDepth: 1 },
      );

      const history = await converter.fetchChatHistory("oc_test_chat", {
        pageSize: 4,
      });

      expect(history.hasMore).toBe(true);
      expect(history.nextPageToken).toBe("next_page");
      expect(history.messages.map((item) => item.markdown)).toEqual([
        "**张三(ou_a)：**\n\n@Blade Agent(cli_test) 帮我看看",
        "**Blade Agent(cli_test)：**\n\n> 回复 **张三(ou_a)** 的消息：\n> @Blade Agent(cli_test) 帮我看看\n\n收到",
        "**张三(ou_a)：**\n\n[消息已撤回]",
        "**李四(ou_b)：**\n\n> 回复 **张三(ou_a)** 的消息：\n> > 回复消息(parent_id: om_older)\n> \n> 页外消息\n\n回复页外消息",
      ]);

      const requestedPaths = mockFetch.mock.calls.map(
        ([input]) => new URL(String(input)).pathname,
      );

      expect(requestedPaths.filter((path) => /\/messages\/[^/]+$/.test(path))).toEqual([
        "/open-apis/im/v1/messages/om_outside",
      ]);
      expect(requestedPaths.some((path) => path.includes("/contact/v3/users/"))).toBe(false);
    });

    it("maxParentDepth 为 0 时不展开引用", async () => {
      const { converter, mockFetch } = await createHarness(
        {
          historyItems: [
            createApiMessage({ messageId: "om_1", createTime: "1", content: '{"text":"原消息"}' }),
            createApiMessage({
              messageId: "om_2",
              createTime: "2",
              parentId: "om_1",
              content: '{"text":"回复"}',
            }),
          ],
          userNames: { ou_api_sender: "王五" },
        },
        { maxParentDepth: 0 },
      );

      const history = await converter.fetchChatHistory("oc_test_chat");

      expect(history.messages[1]?.bodyMarkdown).toBe(
        "> 回复消息(parent_id: om_1)\n\n回复",
      );
      expect(
        mockFetch.mock.calls.some(([input]) =>
          /\/messages\/[^/]+$/.test(new URL(String(input)).pathname),
        ),
      ).toBe(false);
    });
  });
});
