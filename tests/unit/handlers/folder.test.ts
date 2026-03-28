import { describe, expect, it, vi } from "vitest";

import { handleFolder } from "../../../src/handlers/folder.js";
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
    messageType: "folder",
    downloadDir: "/tmp",
    convertMessageBody: vi.fn(),
    depth: 0,
  };
}

describe("handleFolder", () => {
  it("formats a folder message", async () => {
    await expect(
      handleFolder(
        {
          file_key: "fld_123",
          file_name: "项目资料",
        },
        createContext(),
      ),
    ).resolves.toEqual({
      text: "[文件夹: 项目资料]",
      attachments: [],
    });
  });
});

