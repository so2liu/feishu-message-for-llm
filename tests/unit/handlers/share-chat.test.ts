import { describe, expect, it, vi } from "vitest";

import { getHandler } from "../../../src/handlers/index.js";
import { handleShareChat } from "../../../src/handlers/share-chat.js";
import type { FeishuApiClient, HandlerContext } from "../../../src/types.js";

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

function createContext(): HandlerContext {
  return {
    apiClient: createApiClient(),
    mentions: [],
    messageId: "msg_123",
    messageType: "share_chat",
    downloadDir: "/tmp",
    convertMessageBody: vi.fn(),
    depth: 0,
  };
}

describe("handleShareChat", () => {
  it("renders the chat name when lookup succeeds", async () => {
    const context = createContext();
    vi.mocked(context.apiClient.getChatInfo).mockResolvedValue({ name: "飞书项目组" });

    await expect(handleShareChat({ chat_id: "oc_abc123" }, context)).resolves.toEqual({
      text: "[分享群聊: 飞书项目组(oc_abc123)]",
      attachments: [],
    });
  });

  it("falls back to chat id when lookup fails", async () => {
    const context = createContext();
    vi.mocked(context.apiClient.getChatInfo).mockRejectedValue(new Error("boom"));

    await expect(handleShareChat('{"chat_id":"oc_abc123"}', context)).resolves.toEqual({
      text: "[分享群聊: oc_abc123]",
      attachments: [],
    });
  });

  it("registers the share_chat handler", () => {
    expect(getHandler("share_chat")).toBe(handleShareChat);
  });
});
