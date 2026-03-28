import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getHandler } from "../../../src/handlers/index.js";
import { handleMedia } from "../../../src/handlers/media.js";
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

function createContext(overrides: Partial<HandlerContext> = {}): HandlerContext {
  return {
    apiClient: createApiClient(),
    mentions: [],
    messageId: "msg/123",
    messageType: "media",
    downloadDir: tmpdir(),
    convertMessageBody: vi.fn(),
    depth: 0,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleMedia", () => {
  it("downloads video and cover image", async () => {
    const context = createContext();
    vi.mocked(context.apiClient.downloadResource).mockImplementation(
      async (_messageId, _fileKey, _type, savePath) => {
        expect(existsSync(dirname(savePath))).toBe(true);
      },
    );

    const result = await handleMedia(
      {
        file_key: "file_abc",
        image_key: "img_cover",
        file_name: "演示?.mp4",
        duration: 30000,
      },
      context,
    );

    expect(context.apiClient.downloadResource).toHaveBeenNthCalledWith(
      1,
      "msg/123",
      "file_abc",
      "video",
      `${tmpdir()}/msg_123/演示_.mp4`,
      undefined,
    );
    expect(context.apiClient.downloadResource).toHaveBeenNthCalledWith(
      2,
      "msg/123",
      "img_cover",
      "image",
      `${tmpdir()}/msg_123/img_cover.png`,
      undefined,
    );
    expect(result).toEqual({
      text: `[视频: 演示?.mp4, 时长: 30秒](${tmpdir()}/msg_123/演示_.mp4)`,
      attachments: [
        {
          type: "video",
          filePath: `${tmpdir()}/msg_123/演示_.mp4`,
          fileName: "演示?.mp4",
        },
        {
          type: "image",
          filePath: `${tmpdir()}/msg_123/img_cover.png`,
          mimeType: "image/png",
        },
      ],
    });
  });

  it("returns fallback text and keeps successful attachments when downloads fail", async () => {
    const context = createContext();
    vi.mocked(context.apiClient.downloadResource).mockImplementation(
      async (_messageId, fileKey) => {
        if (fileKey === "file_abc") {
          throw new Error("video boom");
        }
      },
    );

    const result = await handleMedia(
      {
        file_key: "file_abc",
        image_key: "img_cover",
        file_name: "演示?.mp4",
        duration: 30000,
      },
      context,
    );

    expect(result).toEqual({
      text: "[视频下载失败: file_abc]",
      attachments: [
        {
          type: "image",
          filePath: `${tmpdir()}/msg_123/img_cover.png`,
          mimeType: "image/png",
        },
      ],
    });
  });

  it("registers the media handler", () => {
    expect(getHandler("media")).toBe(handleMedia);
  });
});
