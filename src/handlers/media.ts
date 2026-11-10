
import { resolveResource, resourceLink, resourceFailure } from "../utils/resource.js";

import type { HandlerContext, HandlerResult } from "../types.js";
import { parseJsonRecord } from "../utils/json.js";

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

  if (context.downloadResources === false) {
    return {
      text: `[视频: ${resolvedFileName}, 时长: ${formatSeconds(duration)}秒]`,
      attachments: [],
    };
  }

  const attachments: HandlerResult["attachments"] = [];
  const resourceErrors: NonNullable<HandlerResult["resourceErrors"]> = [];
  const textParts: string[] = [];
  try {
    const { attachment } = await resolveResource(context, {
      fileKey: resolvedFileKey, type: "video", fileName: resolvedFileName,
    }, resolvedFileName);
    attachments.push(attachment);
    textParts.push(`[视频: ${resolvedFileName}, 时长: ${formatSeconds(duration)}秒](${resourceLink(attachment)})`);
  } catch (error) {
    textParts.push(`[视频下载失败: ${resolvedFileKey}]`);
    resourceErrors.push(...resourceFailure(error).resourceErrors ?? []);
  }
  if (image_key) {
    try {
      const { attachment } = await resolveResource(context, {
        fileKey: image_key, type: "image", mimeType: "image/png",
      }, `${image_key}.png`);
      attachments.push(attachment);
    } catch (error) {
      textParts.push(`[图片下载失败: ${image_key}]`);
      resourceErrors.push(...resourceFailure(error).resourceErrors ?? []);
    }
  }
  return { text: textParts.join("\n"), attachments, ...(resourceErrors.length ? { resourceErrors } : {}) };
}
