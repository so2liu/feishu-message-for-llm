import { describe, expect, it, vi } from "vitest";

import { getHandler } from "../../../src/handlers/index.js";
import { handleVideoChat } from "../../../src/handlers/video-chat.js";
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
    messageType: "video_chat",
    downloadDir: "/tmp",
    convertMessageBody: vi.fn(),
    depth: 0,
  };
}

describe("handleVideoChat", () => {
  it("formats a video chat message", async () => {
    await expect(
      handleVideoChat(
        {
          topic: "项目复盘",
          start_time: "1704117600000",
        },
        createContext(),
      ),
    ).resolves.toEqual({
      text: "[视频通话: 项目复盘, 开始时间: 2024-01-01 14:00]",
      attachments: [],
    });
  });

  it("registers the video_chat handler", () => {
    expect(getHandler("video_chat")).toBe(handleVideoChat);
  });
});
