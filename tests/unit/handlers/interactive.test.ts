import { describe, expect, it, vi } from "vitest";

import { getHandler } from "../../../src/handlers/index.js";
import { handleInteractive } from "../../../src/handlers/interactive.js";
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
    messageId: "msg_123",
    messageType: "interactive",
    downloadDir: "/tmp",
    convertMessageBody: vi.fn(),
    depth: 0,
    ...overrides,
  };
}

describe("handleInteractive", () => {
  it("renders a raw interactive card", async () => {
    const result = await handleInteractive(
      {
        header: {
          title: {
            tag: "plain_text",
            content: "请假申请",
          },
          template: "blue",
        },
        elements: [
          {
            tag: "div",
            text: {
              tag: "plain_text",
              content: "申请人：李四",
            },
          },
          {
            tag: "div",
            text: {
              tag: "plain_text",
              content: "请假时间：3月28日-3月29日",
            },
          },
          {
            tag: "action",
            actions: [
              {
                tag: "button",
                text: {
                  tag: "plain_text",
                  content: "同意",
                },
              },
              {
                tag: "button",
                text: {
                  tag: "plain_text",
                  content: "拒绝",
                },
              },
            ],
          },
        ],
      },
      createContext(),
    );

    expect(result).toEqual({
      text: [
        "[卡片消息]",
        "**请假申请**",
        "申请人：李四",
        "请假时间：3月28日-3月29日",
        "按钮：[同意] [拒绝]",
      ].join("\n"),
      attachments: [],
    });
  });

  it("renders a template interactive card", async () => {
    const result = await handleInteractive(
      {
        type: "template",
        data: {
          template_id: "approval_card_v1",
          template_variable: {
            title: "请假审批",
            applicant: {
              name: "李四",
            },
            duration: "3月28日-3月29日",
          },
        },
      },
      createContext(),
    );

    expect(result).toEqual({
      text: [
        "[卡片消息: approval_card_v1]",
        "请假审批",
        "李四",
        "3月28日-3月29日",
      ].join("\n"),
      attachments: [],
    });
  });

  it("registers the interactive handler", () => {
    expect(getHandler("interactive")).toBe(handleInteractive);
  });

  it("does not throw on malformed nested card json", async () => {
    const result = await handleInteractive(
      {
        card: '{"header":',
      },
      createContext(),
    );

    expect(result).toEqual({
      text: "[卡片消息]",
      attachments: [],
    });
  });
});
