import { mkdirSync } from "node:fs";
import { join } from "node:path";

import type { HandlerContext, HandlerResult } from "../types.js";
import { parseJsonRecord } from "../utils/json.js";
import { sanitizeFileName } from "../utils/sanitize.js";

interface AudioContent {
  file_key?: string;
  duration?: number;
}

function parseAudioContent(content: unknown): AudioContent {
  const parsed = parseJsonRecord(content);

  if (!parsed) {
    return {};
  }

  return {
    file_key: typeof parsed.file_key === "string" ? parsed.file_key : undefined,
    duration:
      typeof parsed.duration === "number" ? parsed.duration : undefined,
  };
}

function formatSeconds(duration?: number): string {
  const seconds = (duration ?? 0) / 1000;

  return Number.isInteger(seconds) ? `${seconds}` : `${seconds}`;
}

export async function handleAudio(
  content: unknown,
  context: HandlerContext,
): Promise<HandlerResult> {
  const { file_key, duration } = parseAudioContent(content);
  const resolvedFileKey = file_key ?? "audio";
  const messageDir = join(context.downloadDir, sanitizeFileName(context.messageId));
  const filePath = join(
    messageDir,
    `${sanitizeFileName(resolvedFileKey)}.opus`,
  );

  mkdirSync(messageDir, { recursive: true });

  try {
    await context.apiClient.downloadResource(
      context.messageId,
      resolvedFileKey,
      "audio",
      filePath,
      context.maxFileSize,
    );
  } catch {
    return {
      text: `[音频下载失败: ${resolvedFileKey}]`,
      attachments: [],
    };
  }

  return {
    text: `[语音消息, 时长: ${formatSeconds(duration)}秒](${filePath})`,
    attachments: [
      {
        type: "audio",
        filePath,
      },
    ],
  };
}
