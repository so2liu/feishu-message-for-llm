import { mkdirSync } from "node:fs";
import { join } from "node:path";

import type { HandlerContext, HandlerResult } from "../types.js";
import { parseJsonRecord } from "../utils/json.js";
import { sanitizeFileName } from "../utils/sanitize.js";

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

export async function handleSticker(
  content: unknown,
  context: HandlerContext,
): Promise<HandlerResult> {
  const { file_key } = parseStickerContent(content);
  const resolvedFileKey = file_key ?? "sticker";
  const messageDir = join(context.downloadDir, sanitizeFileName(context.messageId));
  const filePath = join(
    messageDir,
    `${sanitizeFileName(resolvedFileKey)}.png`,
  );

  mkdirSync(messageDir, { recursive: true });

  try {
    await context.apiClient.downloadResource(
      context.messageId,
      resolvedFileKey,
      "sticker",
      filePath,
      context.maxFileSize,
    );
  } catch {
    return {
      text: `[贴纸下载失败: ${resolvedFileKey}]`,
      attachments: [],
    };
  }

  return {
    text: `[贴纸](${filePath})`,
    attachments: [
      {
        type: "sticker",
        filePath,
        mimeType: "image/png",
      },
    ],
  };
}
