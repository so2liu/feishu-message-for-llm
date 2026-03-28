import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getHandler } from "../../../src/handlers/index.js";
import { handleSticker } from "../../../src/handlers/sticker.js";
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
    messageType: "sticker",
    downloadDir: tmpdir(),
    convertMessageBody: vi.fn(),
    depth: 0,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleSticker", () => {
  it("downloads sticker images and returns a markdown link", async () => {
    const context = createContext();
    vi.mocked(context.apiClient.downloadResource).mockImplementation(
      async (_messageId, _fileKey, _type, savePath) => {
        expect(existsSync(dirname(savePath))).toBe(true);
      },
    );

    const result = await handleSticker(
      {
        file_key: "stk:123",
      },
      context,
    );

    expect(context.apiClient.downloadResource).toHaveBeenCalledWith(
      "msg/123",
      "stk:123",
      "sticker",
      `${tmpdir()}/msg_123/stk_123.png`,
      undefined,
    );
    expect(result).toEqual({
      text: `[贴纸](${tmpdir()}/msg_123/stk_123.png)`,
      attachments: [
        {
          type: "sticker",
          filePath: `${tmpdir()}/msg_123/stk_123.png`,
          mimeType: "image/png",
        },
      ],
    });
  });

  it("returns fallback text when sticker download fails", async () => {
    const context = createContext();
    vi.mocked(context.apiClient.downloadResource).mockRejectedValue(
      new Error("boom"),
    );

    await expect(
      handleSticker(
        {
          file_key: "stk:123",
        },
        context,
      ),
    ).resolves.toEqual({
      text: "[贴纸下载失败: stk:123]",
      attachments: [],
    });
  });

  it("registers the sticker handler", () => {
    expect(getHandler("sticker")).toBe(handleSticker);
  });
});
