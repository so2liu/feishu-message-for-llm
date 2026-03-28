import type { HandlerContext, HandlerResult } from "../types.js";
import { parseJsonRecord } from "../utils/json.js";

interface ShareChatContent {
  chat_id?: string;
}

function parseShareChatContent(content: unknown): ShareChatContent {
  const parsed = parseJsonRecord(content);

  if (!parsed) {
    return {};
  }

  return {
    chat_id: typeof parsed.chat_id === "string" ? parsed.chat_id : undefined,
  };
}

export async function handleShareChat(
  content: unknown,
  context: HandlerContext,
): Promise<HandlerResult> {
  const { chat_id } = parseShareChatContent(content);

  if (!chat_id) {
    return {
      text: "[分享群聊: ]",
      attachments: [],
    };
  }

  try {
    const { name } = await context.apiClient.getChatInfo(chat_id);

    return {
      text: `[分享群聊: ${name}(${chat_id})]`,
      attachments: [],
    };
  } catch {
    return {
      text: `[分享群聊: ${chat_id}]`,
      attachments: [],
    };
  }
}
