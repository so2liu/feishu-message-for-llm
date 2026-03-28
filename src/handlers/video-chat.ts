import type { HandlerContext, HandlerResult } from "../types.js";
import { parseJsonRecord } from "../utils/json.js";
import { formatTimestamp } from "../utils/time.js";

interface VideoChatContent {
  topic?: string;
  start_time?: string;
}

function parseVideoChatContent(content: unknown): VideoChatContent {
  const parsed = parseJsonRecord(content);

  if (!parsed) {
    return {};
  }

  return {
    topic: typeof parsed.topic === "string" ? parsed.topic : undefined,
    start_time:
      typeof parsed.start_time === "string"
        ? parsed.start_time
        : typeof parsed.start_time === "number"
          ? String(parsed.start_time)
          : undefined,
  };
}

export async function handleVideoChat(
  content: unknown,
  _context: HandlerContext,
): Promise<HandlerResult> {
  const { topic = "", start_time } = parseVideoChatContent(content);

  return {
    text: `[视频通话: ${topic}, 开始时间: ${formatTimestamp(start_time ?? "")}]`,
    attachments: [],
  };
}
