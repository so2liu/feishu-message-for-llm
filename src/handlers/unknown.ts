import type { HandlerContext, HandlerResult } from "../types.js";

export async function handleUnknown(
  _content: unknown,
  context: HandlerContext,
): Promise<HandlerResult> {
  return {
    text: `[不支持的消息类型: ${context.messageType}]`,
    attachments: [],
  };
}

