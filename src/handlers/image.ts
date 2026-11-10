
import { resolveResource, resourceLink, resourceFailure } from "../utils/resource.js";

import type { HandlerContext, HandlerResult } from "../types.js";
import { parseJsonRecord } from "../utils/json.js";

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

export async function handleImage(content: unknown, context: HandlerContext): Promise<HandlerResult> {
  const { image_key } = parseImageContent(content);
  if (!image_key) return { text: "[图片下载失败: ]", attachments: [] };
  if (context.downloadResources === false) return { text: `[图片]`, attachments: [] };
  const resolvedKey = image_key ?? "image";
  try {
    const { attachment } = await resolveResource(context, {
      fileKey: resolvedKey, type: "image", mimeType: "image/png",
    }, `${resolvedKey}.png`);
    return { text: `![图片](${resourceLink(attachment)})`, attachments: [attachment] };
  } catch (error) {
    return { text: `[图片下载失败: ${resolvedKey}]`, attachments: [], ...resourceFailure(error) };
  }
}
