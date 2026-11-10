
import { resolveResource, resourceLink, resourceFailure } from "../utils/resource.js";

import type { HandlerContext, HandlerResult } from "../types.js";
import { parseJsonRecord } from "../utils/json.js";

interface StickerContent {
  file_key?: string;
}

function parseStickerContent(content: unknown): StickerContent {
  const parsed = parseJsonRecord(content);

  if (!parsed) {
    return {};
  }

  return {
    file_key: typeof parsed.file_key === "string" ? parsed.file_key : undefined,
  };
}

export async function handleSticker(content: unknown, context: HandlerContext): Promise<HandlerResult> {
  const { file_key } = parseStickerContent(content);
  if (context.downloadResources === false) return { text: `[贴纸]`, attachments: [] };
  const resolvedKey = file_key ?? "sticker";
  try {
    const { attachment } = await resolveResource(context, {
      fileKey: resolvedKey, type: "sticker", mimeType: "image/png",
    }, `${resolvedKey}.png`);
    return { text: `[贴纸](${resourceLink(attachment)})`, attachments: [attachment] };
  } catch (error) {
    return { text: `[贴纸下载失败: ${resolvedKey}]`, attachments: [], ...resourceFailure(error) };
  }
}
