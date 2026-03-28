import { describe, expect, it, vi } from "vitest";

import { handleText } from "../../../src/handlers/text.js";
import type { FeishuApiClient, HandlerContext, Mention } from "../../../src/types.js";

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

function createContext(overrides: Partial<HandlerContext> = {}): HandlerContext {
  return {
    apiClient: createApiClient(),
    mentions: [],
    messageId: "msg_123",
    messageType: "text",
    downloadDir: "/tmp",
    convertMessageBody: vi.fn(),
    depth: 0,
    ...overrides,
  };
}

describe("handleText", () => {
  it("replaces mentions and enriches feishu document links", async () => {
    const mentions: Mention[] = [
      {
        key: "@_user_1",
        id: {
          union_id: "on_1",
          user_id: "u_1",
          open_id: "ou_1",
        },
        name: "李四",
        tenant_key: "tenant",
      },
    ];
    const context = createContext({ mentions });
    vi.mocked(context.apiClient.getDocMeta).mockResolvedValue({ title: "设计文档" });

    const result = await handleText(
      {
        text: "@_user_1 看一下 https://team.feishu.cn/docx/abc123",
      },
      context,
    );

    expect(result).toEqual({
      text: "@李四(ou_1) 看一下 [设计文档](https://team.feishu.cn/docx/abc123)",
      attachments: [],
    });
    expect(context.apiClient.getDocMeta).toHaveBeenCalledWith("abc123", "docx");
  });

  it("accepts json string content", async () => {
    const context = createContext();

    const result = await handleText('{"text":"纯文本消息"}', context);

    expect(result).toEqual({
      text: "纯文本消息",
      attachments: [],
    });
  });

  it("does not throw on malformed json string content", async () => {
    const context = createContext();

    const result = await handleText('{"text"', context);

    expect(result).toEqual({
      text: "",
      attachments: [],
    });
  });
});
