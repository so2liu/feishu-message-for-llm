import type { HandlerContext, HandlerResult } from "../types.js";
import { parseJsonRecord } from "../utils/json.js";
import { formatTimestamp } from "../utils/time.js";

interface CalendarContent {
  summary?: string;
  start_time?: string;
  end_time?: string;
}

function parseCalendarContent(content: unknown): CalendarContent {
  const parsed = parseJsonRecord(content);

  if (!parsed) {
    return {};
  }

  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
    start_time:
      typeof parsed.start_time === "string"
        ? parsed.start_time
        : typeof parsed.start_time === "number"
          ? String(parsed.start_time)
          : undefined,
    end_time:
      typeof parsed.end_time === "string"
        ? parsed.end_time
        : typeof parsed.end_time === "number"
          ? String(parsed.end_time)
          : undefined,
  };
}

export async function handleCalendar(
  content: unknown,
  _context: HandlerContext,
): Promise<HandlerResult> {
  const { summary = "", start_time, end_time } = parseCalendarContent(content);

  return {
    text: `[日程: ${summary}, 开始: ${formatTimestamp(start_time ?? "")}, 结束: ${formatTimestamp(end_time ?? "")}]`,
    attachments: [],
  };
}
