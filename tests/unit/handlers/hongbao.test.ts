import { describe, expect, it, vi } from "vitest";

import { handleHongbao } from "../../../src/handlers/hongbao.js";
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
    messageType: "hongbao",
    downloadDir: "/tmp",
    convertMessageBody: vi.fn(),
    depth: 0,
  };
}

describe("handleHongbao", () => {
  it("returns the hongbao placeholder text", async () => {
    await expect(handleHongbao({}, createContext())).resolves.toEqual({
      text: "[红包]",
      attachments: [],
    });
  });
});

