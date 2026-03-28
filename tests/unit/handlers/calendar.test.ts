import { describe, expect, it, vi } from "vitest";

import { getHandler } from "../../../src/handlers/index.js";
import { handleCalendar } from "../../../src/handlers/calendar.js";
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

function createContext(messageType: HandlerContext["messageType"] = "calendar"): HandlerContext {
  return {
    apiClient: createApiClient(),
    mentions: [],
    messageId: "msg_123",
    messageType,
    downloadDir: "/tmp",
    convertMessageBody: vi.fn(),
    depth: 0,
  };
}

describe("handleCalendar", () => {
  it("formats a calendar message", async () => {
    await expect(
      handleCalendar(
        {
          summary: "项目周会",
          start_time: "1704117600000",
          end_time: "1704121200000",
        },
        createContext(),
      ),
    ).resolves.toEqual({
      text: "[日程: 项目周会, 开始: 2024-01-01 14:00, 结束: 2024-01-01 15:00]",
      attachments: [],
    });
  });

  it("registers all calendar message types", () => {
    expect(getHandler("share_calendar_event")).toBe(handleCalendar);
    expect(getHandler("calendar")).toBe(handleCalendar);
    expect(getHandler("general_calendar")).toBe(handleCalendar);
  });
});
