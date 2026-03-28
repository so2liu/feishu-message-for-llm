import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getHandler } from "../../../src/handlers/index.js";
import { handleFile } from "../../../src/handlers/file.js";
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

function createContext(downloadDir: string): HandlerContext {
  return {
    apiClient: createApiClient(),
    mentions: [],
    messageId: "msg/123",
    messageType: "file",
    downloadDir,
    convertMessageBody: vi.fn(),
    depth: 0,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleFile", () => {
  it("downloads binary files and returns a link", async () => {
    const downloadDir = await mkdtemp(join(tmpdir(), "file-handler-"));
    const context = createContext(downloadDir);

    vi.mocked(context.apiClient.downloadResource).mockImplementation(
      async (_messageId, _fileKey, _type, savePath) => {
        expect(existsSync(dirname(savePath))).toBe(true);
        await writeFile(savePath, "binary");
      },
    );

    try {
      const result = await handleFile(
        {
          file_key: "file_123",
          file_name: "design.psd",
        },
        context,
      );

      expect(result).toEqual({
        text: `[文件: design.psd](${downloadDir}/msg_123/design.psd)`,
        attachments: [
          {
            type: "file",
            filePath: `${downloadDir}/msg_123/design.psd`,
            fileName: "design.psd",
          },
        ],
      });
    } finally {
      await rm(downloadDir, { recursive: true, force: true });
    }
  });

  it("reads text file contents into a fenced code block", async () => {
    const downloadDir = await mkdtemp(join(tmpdir(), "file-handler-"));
    const context = createContext(downloadDir);

    vi.mocked(context.apiClient.downloadResource).mockImplementation(
      async (_messageId, _fileKey, _type, savePath) => {
        expect(existsSync(dirname(savePath))).toBe(true);
        await writeFile(
          savePath,
          "2024-01-01 10:00:00 ERROR Connection timeout\n2024-01-01 10:00:01 ERROR Retry failed",
        );
      },
    );

    try {
      const result = await handleFile(
        {
          file_key: "file_abc",
          file_name: "error.log",
        },
        context,
      );

      expect(result).toEqual({
        text:
          `[文件: error.log](${downloadDir}/msg_123/error.log)\n\n` +
          "<error.log 内容>\n" +
          "```log\n" +
          "2024-01-01 10:00:00 ERROR Connection timeout\n" +
          "2024-01-01 10:00:01 ERROR Retry failed\n" +
          "```\n" +
          "</error.log 内容>",
        attachments: [
          {
            type: "file",
            filePath: `${downloadDir}/msg_123/error.log`,
            fileName: "error.log",
          },
        ],
      });
    } finally {
      await rm(downloadDir, { recursive: true, force: true });
    }
  });

  it("registers the file handler", () => {
    expect(getHandler("file")).toBe(handleFile);
  });

  it("truncates oversized text previews", async () => {
    const downloadDir = await mkdtemp(join(tmpdir(), "file-handler-"));
    const context = createContext(downloadDir);
    const longContent = "a".repeat(70 * 1024);

    vi.mocked(context.apiClient.downloadResource).mockImplementation(
      async (_messageId, _fileKey, _type, savePath) => {
        await writeFile(savePath, longContent);
      },
    );

    try {
      const result = await handleFile(
        {
          file_key: "file_large",
          file_name: "large.txt",
        },
        context,
      );

      expect(result.text).toContain("[内容已截断，预览前 65536 字节]");
      expect(result.text).toContain("```txt\n");
      expect(result.text.length).toBeLessThan(longContent.length);
    } finally {
      await rm(downloadDir, { recursive: true, force: true });
    }
  });
});
