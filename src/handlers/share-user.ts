import type { HandlerContext, HandlerResult } from "../types.js";
import { parseJsonRecord } from "../utils/json.js";

interface ShareUserContent {
  user_id?: string;
}

function parseShareUserContent(content: unknown): ShareUserContent {
  const parsed = parseJsonRecord(content);

  if (!parsed) {
    return {};
  }

  return {
    user_id: typeof parsed.user_id === "string" ? parsed.user_id : undefined,
  };
}

export async function handleShareUser(
  content: unknown,
  context: HandlerContext,
): Promise<HandlerResult> {
  const { user_id } = parseShareUserContent(content);
  const resolvedUserId = user_id ?? "";

  if (!resolvedUserId) {
    return {
      text: "[分享用户: 未知用户()]",
      attachments: [],
    };
  }

  try {
    const { name } = await context.apiClient.getUserInfo(resolvedUserId);

    return {
      text: `[分享用户: ${name}(${resolvedUserId})]`,
      attachments: [],
    };
  } catch {
    return {
      text: `[分享用户: 未知用户(${resolvedUserId})]`,
      attachments: [],
    };
  }
}
