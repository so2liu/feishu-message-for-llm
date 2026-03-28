import type { HandlerContext, HandlerResult } from "../types.js";
import { parseJsonRecord } from "../utils/json.js";

interface VoteContent {
  topic?: string;
  options: string[];
}

function parseVoteContent(content: unknown): VoteContent {
  const parsed = parseJsonRecord(content);

  if (!parsed) {
    return { options: [] };
  }

  return {
    topic: typeof parsed.topic === "string" ? parsed.topic : undefined,
    options: Array.isArray(parsed.options)
      ? parsed.options.filter((option): option is string => typeof option === "string")
      : [],
  };
}

export async function handleVote(
  content: unknown,
  _context: HandlerContext,
): Promise<HandlerResult> {
  const { topic = "", options } = parseVoteContent(content);
  const optionLines = options.map((option) => `- ${option}`).join("\n");

  return {
    text: optionLines ? `[投票: ${topic}]\n${optionLines}` : `[投票: ${topic}]`,
    attachments: [],
  };
}
