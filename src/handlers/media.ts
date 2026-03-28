import { mkdirSync } from "node:fs";
import { join } from "node:path";

import type { HandlerContext, HandlerResult } from "../types.js";
import { parseJsonRecord } from "../utils/json.js";
import { sanitizeFileName } from "../utils/sanitize.js";

interface MediaContent {
  file_key?: string;
  image_key?: string;
  file_name?: string;
  duration?: number;
}

function parseMediaContent(content: unknown): MediaContent {
  const parsed = parseJsonRecord(content);

  if (!parsed) {
    return {};
  }

  return {
    file_key: typeof parsed.file_key === "string" ? parsed.file_key : undefined,
    image_key:
      typeof parsed.image_key === "string" ? parsed.image_key : undefined,
    file_name:
      typeof parsed.file_name === "string" ? parsed.file_name : undefined,
    duration:
      typeof parsed.duration === "number" ? parsed.duration : undefined,
  };
}

function formatSeconds(duration?: number): string {
  const seconds = (duration ?? 0) / 1000;

  return Number.isInteger(seconds) ? `${seconds}` : `${seconds}`;
}

export async function handleMedia(
  content: unknown,
  context: HandlerContext,
): Promise<HandlerResult> {
  const { file_key, image_key, file_name, duration } = parseMediaContent(content);
  const resolvedFileKey = file_key ?? "video";
  const resolvedFileName = file_name || `${resolvedFileKey}.mp4`;
  const messageDir = join(context.downloadDir, sanitizeFileName(context.messageId));
  const filePath = join(messageDir, sanitizeFileName(resolvedFileName));

  mkdirSync(messageDir, { recursive: true });

  const attachments: HandlerResult["attachments"] = [];
  const textParts: string[] = [];

  try {
    await context.apiClient.downloadResource(
      context.messageId,
      resolvedFileKey,
      "video",
      filePath,
      context.maxFileSize,
    );
    attachments.push({
      type: "video",
      filePath,
      fileName: resolvedFileName,
    });
    textParts.push(
      `[视频: ${resolvedFileName}, 时长: ${formatSeconds(duration)}秒](${filePath})`,
    );
  } catch {
    textParts.push(`[视频下载失败: ${resolvedFileKey}]`);
  }

  if (image_key) {
    const coverPath = join(messageDir, `${sanitizeFileName(image_key)}.png`);

    try {
      await context.apiClient.downloadResource(
        context.messageId,
        image_key,
        "image",
        coverPath,
        context.maxFileSize,
      );
      attachments.push({
        type: "image",
        filePath: coverPath,
        mimeType: "image/png",
      });
    } catch {
      textParts.push(`[图片下载失败: ${image_key}]`);
    }
  }

  return {
    text: textParts.join("\n"),
    attachments,
  };
}
