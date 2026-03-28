import { describe, expect, it, vi } from "vitest";

import { getHandler } from "../../../src/handlers/index.js";
import { handleTodo } from "../../../src/handlers/todo.js";
import type {
  FeishuApiClient,
  HandlerContext,
  Mention,
} from "../../../src/types.js";

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
    messageId: "msg_123",
    messageType: "todo",
    downloadDir: "/tmp",
    convertMessageBody: vi.fn(),
    depth: 0,
    ...overrides,
  };
}

describe("handleTodo", () => {
  it("extracts plain text from post summary", async () => {
    const mentions: Mention[] = [
      {
        key: "@_user_1",
        id: {
          union_id: "on_1",
          user_id: "u_1",
          open_id: "ou_1",
        },
        name: "张三",
        tenant_key: "tenant",
      },
    ];
    const context = createContext({ mentions });
    vi.mocked(context.apiClient.getDocMeta).mockResolvedValue({ title: "设计文档" });

    await expect(
      handleTodo(
        {
          task_id: "task_123",
          summary: {
            content: [
              [
                { tag: "text", text: "修复 ", style: ["bold"] },
                { tag: "at", user_id: "@_user_1", user_name: "张三" },
                { tag: "text", text: " 的 bug，参考 ", style: [] },
                {
                  tag: "a",
                  text: "文档",
                  href: "https://team.feishu.cn/docx/abc123",
                  style: [],
                },
              ],
            ],
          },
          due_time: "1704458400000",
        },
        context,
      ),
    ).resolves.toEqual({
      text: "[任务: 修复 @张三(ou_1) 的 bug，参考 设计文档, 截止: 2024-01-05 12:40]",
      attachments: [],
    });
  });

  it("registers the todo handler", () => {
    expect(getHandler("todo")).toBe(handleTodo);
  });
});
