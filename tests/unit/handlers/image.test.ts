import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getHandler } from "../../../src/handlers/index.js";
import { handleImage } from "../../../src/handlers/image.js";
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
    messageType: "image",
    downloadDir: tmpdir(),
    convertMessageBody: vi.fn(),
    depth: 0,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleImage", () => {
  it("downloads image resources and returns a markdown image", async () => {
    const context = createContext();
    vi.mocked(context.apiClient.downloadResource).mockImplementation(async () => {
      expect(existsSync(dirname("/"))).toBe(true);
    });

    const result = await handleImage(
      {
        image_key: "img:key",
      },
      context,
    );

    expect(context.apiClient.downloadResource).toHaveBeenCalledWith(
      "msg/123",
      "img:key",
      "image",
      `${tmpdir()}/msg_123/img_key.png`,
      undefined,
    );
    expect(result).toEqual({
      text: `![图片](${tmpdir()}/msg_123/img_key.png)`,
      attachments: [
        {
          type: "image",
          filePath: `${tmpdir()}/msg_123/img_key.png`,
          mimeType: "image/png",
        },
      ],
    });
  });

  it("returns fallback text when download fails", async () => {
    const context = createContext();
    vi.mocked(context.apiClient.downloadResource).mockRejectedValue(
      new Error("boom"),
    );

    await expect(
      handleImage(
        {
          image_key: "img_123",
        },
        context,
      ),
    ).resolves.toEqual({
      text: "[图片下载失败: img_123]",
      attachments: [],
    });
  });

  it("registers the image handler", () => {
    expect(getHandler("image")).toBe(handleImage);
  });
});
