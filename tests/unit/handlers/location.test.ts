import { describe, expect, it, vi } from "vitest";

import { handleLocation } from "../../../src/handlers/location.js";
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
    messageType: "location",
    downloadDir: "/tmp",
    convertMessageBody: vi.fn(),
    depth: 0,
  };
}

describe("handleLocation", () => {
  it("formats a location message", async () => {
    await expect(
      handleLocation(
        {
          name: "上海科技馆",
          longitude: 121.544,
          latitude: 31.221,
        },
        createContext(),
      ),
    ).resolves.toEqual({
      text: "[位置: 上海科技馆, 经度: 121.544, 纬度: 31.221]",
      attachments: [],
    });
  });
});

