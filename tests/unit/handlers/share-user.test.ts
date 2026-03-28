import { describe, expect, it, vi } from "vitest";

import { getHandler } from "../../../src/handlers/index.js";
import { handleShareUser } from "../../../src/handlers/share-user.js";
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
    messageType: "share_user",
    downloadDir: "/tmp",
    convertMessageBody: vi.fn(),
    depth: 0,
  };
}

describe("handleShareUser", () => {
  it("renders the user name when lookup succeeds", async () => {
    const context = createContext();
    vi.mocked(context.apiClient.getUserInfo).mockResolvedValue({ name: "李四" });

    await expect(handleShareUser({ user_id: "ou_def456" }, context)).resolves.toEqual({
      text: "[分享用户: 李四(ou_def456)]",
      attachments: [],
    });
  });

  it("falls back to unknown user when lookup fails", async () => {
    const context = createContext();
    vi.mocked(context.apiClient.getUserInfo).mockRejectedValue(new Error("boom"));

    await expect(handleShareUser('{"user_id":"ou_def456"}', context)).resolves.toEqual({
      text: "[分享用户: 未知用户(ou_def456)]",
      attachments: [],
    });
  });

  it("registers the share_user handler", () => {
    expect(getHandler("share_user")).toBe(handleShareUser);
  });
});
