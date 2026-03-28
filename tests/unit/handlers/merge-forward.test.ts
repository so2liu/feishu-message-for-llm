import { describe, expect, it, vi } from "vitest";

import { getHandler } from "../../../src/handlers/index.js";
import { handleMergeForward } from "../../../src/handlers/merge-forward.js";
import type {
  Attachment,
  FeishuApiClient,
  FeishuApiMessage,
  HandlerContext,
  HandlerResult,
} from "../../../src/types.js";

function createApiClient(): FeishuApiClient {
  return {
    getTenantAccessToken: vi.fn(),
    getUserInfo: vi.fn(),
    getChatInfo: vi.fn(),
    getMessage: vi.fn(),
    getMergeForwardMessages: vi.fn(),
    downloadResource: vi.fn(),
    getDocMeta: vi.fn(),
  };
}

function createApiMessage(overrides: Partial<FeishuApiMessage>): FeishuApiMessage {
  return {
    message_id: "om_msg_default",
    msg_type: "text",
    create_time: "1710000000",
    update_time: "1710000000",
    chat_id: "oc_default",
    sender: {
      id: "ou_default",
      id_type: "open_id",
      sender_type: "user",
      tenant_key: "tenant",
    },
    body: {
      content: '{"text":"default"}',
    },
    ...overrides,
  };
}

function createContext(overrides: Partial<HandlerContext> = {}): HandlerContext {
  return {
    apiClient: createApiClient(),
    mentions: [],
    messageId: "om_merge_123",
    messageType: "merge_forward",
    downloadDir: "/tmp",
    convertMessageBody: vi.fn<HandlerContext["convertMessageBody"]>(),
    depth: 0,
    ...overrides,
  };
}

describe("handleMergeForward", () => {
  it("renders merged forwarded messages and aggregates attachments", async () => {
    const context = createContext();
    const childMessages = [
      createApiMessage({
        message_id: "om_child_1",
        sender: {
          id: "ou_xxx",
          id_type: "open_id",
          sender_type: "user",
          tenant_key: "tenant",
        },
      }),
      createApiMessage({
        message_id: "om_child_2",
        sender: {
          id: "ou_yyy",
          id_type: "open_id",
          sender_type: "user",
          tenant_key: "tenant",
        },
      }),
    ];
    const attachments: Attachment[] = [
      {
        type: "image",
        filePath: "/tmp/om_merge_123/img.png",
      },
    ];

    vi.mocked(context.apiClient.getMergeForwardMessages).mockResolvedValue(
      childMessages,
    );
    vi.mocked(context.apiClient.getUserInfo)
      .mockResolvedValueOnce({ name: "张三" })
      .mockResolvedValueOnce({ name: "李四" });
    vi.mocked(context.convertMessageBody)
      .mockResolvedValueOnce({
        text: "第一条消息",
        attachments,
      } satisfies HandlerResult)
      .mockResolvedValueOnce({
        text: "第二条消息",
        attachments: [],
      } satisfies HandlerResult);

    await expect(handleMergeForward('{"text":"[合并转发]"}', context)).resolves.toEqual({
      text:
        "> **合并转发消息：**\n" +
        "> **张三(ou_xxx)：** 第一条消息\n" +
        "> **李四(ou_yyy)：** 第二条消息",
      attachments,
    });
    expect(context.apiClient.getMergeForwardMessages).toHaveBeenCalledWith(
      "om_merge_123",
    );
    expect(context.convertMessageBody).toHaveBeenNthCalledWith(
      1,
      childMessages[0],
      1,
    );
    expect(context.convertMessageBody).toHaveBeenNthCalledWith(
      2,
      childMessages[1],
      1,
    );
  });

  it("returns depth limit text when nesting depth reaches the maximum", async () => {
    const context = createContext({ depth: 3 });

    await expect(handleMergeForward({}, context)).resolves.toEqual({
      text: "[合并转发消息: 超过最大嵌套深度]",
      attachments: [],
    });
    expect(context.apiClient.getMergeForwardMessages).not.toHaveBeenCalled();
  });

  it("falls back when merge forward api fails", async () => {
    const context = createContext();
    vi.mocked(context.apiClient.getMergeForwardMessages).mockRejectedValue(
      new Error("boom"),
    );

    await expect(handleMergeForward({}, context)).resolves.toEqual({
      text: "[合并转发消息获取失败: om_merge_123]",
      attachments: [],
    });
  });

  it("registers the merge_forward handler", () => {
    expect(getHandler("merge_forward")).toBe(handleMergeForward);
  });
});
