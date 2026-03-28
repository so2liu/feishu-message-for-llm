import type { HandlerContext, HandlerResult } from "../types.js";

export async function handleHongbao(
  _content: unknown,
  _context: HandlerContext,
): Promise<HandlerResult> {
  return {
    text: "[红包]",
    attachments: [],
  };
}

