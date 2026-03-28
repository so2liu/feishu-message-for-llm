import { describe, expect, it, vi } from "vitest";

import { handleUnknown } from "../../../src/handlers/unknown.js";
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

function createContext(messageType: string): HandlerContext {
  return {
    apiClient: createApiClient(),
    mentions: [],
    messageId: "msg_123",
    messageType,
    downloadDir: "/tmp",
    convertMessageBody: vi.fn(),
    depth: 0,
  };
}

describe("handleUnknown", () => {
  it("includes the message type in the fallback text", async () => {
    await expect(handleUnknown({}, createContext("mystery_type"))).resolves.toEqual({
      text: "[不支持的消息类型: mystery_type]",
      attachments: [],
    });
  });
});
