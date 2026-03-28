import { describe, expect, it, vi } from "vitest";

import { getHandler } from "../../../src/handlers/index.js";
import { handleSystem } from "../../../src/handlers/system.js";
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
    messageType: "system",
    downloadDir: "/tmp",
    convertMessageBody: vi.fn(),
    depth: 0,
  };
}

describe("handleSystem", () => {
  it("fills template variables from nested values", async () => {
    await expect(
      handleSystem(
        {
          template: "{from_user.name} 邀请 {to_chatters} 加入 {chat_name}",
          from_user: {
            name: "张三",
            open_id: "ou_1",
          },
          to_chatters: [
            { name: "李四", open_id: "ou_2" },
            { name: "王五", open_id: "ou_3" },
          ],
          chat_name: "项目群",
        },
        createContext(),
      ),
    ).resolves.toEqual({
      text: "[系统消息: 张三 邀请 李四、王五 加入 项目群]",
      attachments: [],
    });
  });

  it("registers the system handler", () => {
    expect(getHandler("system")).toBe(handleSystem);
  });
});
