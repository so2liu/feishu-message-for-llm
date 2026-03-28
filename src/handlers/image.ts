import { mkdirSync } from "node:fs";
import { join } from "node:path";

import type { HandlerContext, HandlerResult } from "../types.js";
import { parseJsonRecord } from "../utils/json.js";
import { sanitizeFileName } from "../utils/sanitize.js";

interface ImageContent {
  image_key?: string;
}

function parseImageContent(content: unknown): ImageContent {
  const parsed = parseJsonRecord(content);

  if (!parsed) {
    return {};
  }

  return {
    image_key:
      typeof parsed.image_key === "string" ? parsed.image_key : undefined,
  };
}

export async function handleImage(
  content: unknown,
  context: HandlerContext,
): Promise<HandlerResult> {
  const { image_key } = parseImageContent(content);

  if (!image_key) {
    return {
      text: "[图片下载失败: ]",
      attachments: [],
    };
  }

  const messageDir = join(context.downloadDir, sanitizeFileName(context.messageId));
  const filePath = join(messageDir, `${sanitizeFileName(image_key)}.png`);

  mkdirSync(messageDir, { recursive: true });

  try {
    await context.apiClient.downloadResource(
      context.messageId,
      image_key,
      "image",
      filePath,
      context.maxFileSize,
    );

    return {
      text: `![图片](${filePath})`,
      attachments: [
        {
          type: "image",
          filePath,
          mimeType: "image/png",
        },
      ],
    };
  } catch {
    return {
      text: `[图片下载失败: ${image_key}]`,
      attachments: [],
    };
  }
}
