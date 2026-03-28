import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getHandler } from "../../../src/handlers/index.js";
import { handleAudio } from "../../../src/handlers/audio.js";
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
    messageType: "audio",
    downloadDir: tmpdir(),
    convertMessageBody: vi.fn(),
    depth: 0,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleAudio", () => {
  it("downloads audio files and formats duration in seconds", async () => {
    const context = createContext();
    vi.mocked(context.apiClient.downloadResource).mockImplementation(
      async (_messageId, _fileKey, _type, savePath) => {
        expect(existsSync(dirname(savePath))).toBe(true);
      },
    );

    const result = await handleAudio(
      {
        file_key: "file:abc",
        duration: 5000,
      },
      context,
    );

    expect(context.apiClient.downloadResource).toHaveBeenCalledWith(
      "msg/123",
      "file:abc",
      "audio",
      `${tmpdir()}/msg_123/file_abc.opus`,
      undefined,
    );
    expect(result).toEqual({
      text: `[语音消息, 时长: 5秒](${tmpdir()}/msg_123/file_abc.opus)`,
      attachments: [
        {
          type: "audio",
          filePath: `${tmpdir()}/msg_123/file_abc.opus`,
        },
      ],
    });
  });

  it("registers the audio handler", () => {
    expect(getHandler("audio")).toBe(handleAudio);
  });
});
