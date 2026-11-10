
import { resolveResource, resourceLink, resourceFailure } from "../utils/resource.js";

import type { HandlerContext, HandlerResult } from "../types.js";
import { parseJsonRecord } from "../utils/json.js";

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

export async function handleAudio(content: unknown, context: HandlerContext): Promise<HandlerResult> {
  const { file_key, duration } = parseAudioContent(content);
  if (context.downloadResources === false) return { text: `[语音消息, 时长: ${formatSeconds(duration)}秒]`, attachments: [] };
  const resolvedKey = file_key ?? "audio";
  try {
    const { attachment } = await resolveResource(context, {
      fileKey: resolvedKey, type: "audio",
    }, `${resolvedKey}.opus`);
    return { text: `[语音消息, 时长: ${formatSeconds(duration)}秒](${resourceLink(attachment)})`, attachments: [attachment] };
  } catch (error) {
    return { text: `[音频下载失败: ${resolvedKey}]`, attachments: [], ...resourceFailure(error) };
  }
}
