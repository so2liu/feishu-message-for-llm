import { mkdirSync } from "node:fs";
import { join } from "node:path";

import type {
  Attachment,
  HandlerContext,
  HandlerResult,
  Mention,
} from "../types.js";
import { parseDocUrl } from "../utils/doc-link.js";
import { parseJsonRecord } from "../utils/json.js";
import { sanitizeFileName } from "../utils/sanitize.js";
import { applyStyles } from "../utils/style.js";

interface PostContent {
  title?: string;
  content?: unknown[];
}

interface TextPostTag {
  tag: "text";
  text?: string;
  style?: string[];
}

interface LinkPostTag {
  tag: "a";
  text?: string;
  href?: string;
  style?: string[];
}

interface MentionPostTag {
  tag: "at";
  user_id?: string;
  user_name?: string;
}

interface ImagePostTag {
  tag: "img";
  image_key?: string;
}

interface MediaPostTag {
  tag: "media";
  file_key?: string;
  image_key?: string;
}

interface EmotionPostTag {
  tag: "emotion";
  emoji_type?: string;
}

interface CodeBlockPostTag {
  tag: "code_block";
  language?: string;
  text?: string;
}

interface HrPostTag {
  tag: "hr";
}

type PostTag =
  | TextPostTag
  | LinkPostTag
  | MentionPostTag
  | ImagePostTag
  | MediaPostTag
  | EmotionPostTag
  | CodeBlockPostTag
  | HrPostTag;

export function parsePostContent(content: unknown): PostContent {
  const parsed = parseJsonRecord(content);

  if (!parsed) {
    return {};
  }

  return {
    title: typeof parsed.title === "string" ? parsed.title : undefined,
    content: Array.isArray(parsed.content) ? parsed.content : undefined,
  };
}

function resolveMessageDir(context: HandlerContext): string {
  return join(context.downloadDir, sanitizeFileName(context.messageId));
}

function getMentionDisplay(tag: MentionPostTag, mentions: Mention[]): string {
  if (tag.user_id === "@_all") {
    return "@所有人";
  }

  const mention = mentions.find((item) => item.key === tag.user_id);

  if (mention) {
    return `@${mention.name}(${mention.id.open_id})`;
  }

  if (typeof tag.user_name === "string" && tag.user_name.length > 0) {
    return `@${tag.user_name}`;
  }

  return tag.user_id ?? "";
}

async function getLinkText(
  tag: LinkPostTag,
  context: HandlerContext,
): Promise<string> {
  const fallbackText = typeof tag.text === "string" ? tag.text : "";

  if (typeof tag.href !== "string") {
    return fallbackText;
  }

  const parsedDocUrl = parseDocUrl(tag.href);

  if (!parsedDocUrl) {
    return fallbackText;
  }

  try {
    const metadata = await context.apiClient.getDocMeta(
      parsedDocUrl.docToken,
      parsedDocUrl.docType,
    );

    return metadata.title || fallbackText;
  } catch {
    return fallbackText;
  }
}

async function renderTag(
  rawTag: unknown,
  context: HandlerContext,
  plainText = false,
): Promise<HandlerResult> {
  if (!rawTag || typeof rawTag !== "object" || typeof (rawTag as PostTag).tag !== "string") {
    return { text: "", attachments: [] };
  }

  const tag = rawTag as PostTag;

  switch (tag.tag) {
    case "text":
      return {
        text: plainText ? (tag.text ?? "") : applyStyles(tag.text ?? "", tag.style ?? []),
        attachments: [],
      };
    case "a": {
      const linkText = await getLinkText(tag, context);

      if (plainText) {
        return {
          text: linkText,
          attachments: [],
        };
      }

      const href = tag.href ?? "";

      return {
        text: applyStyles(`[${linkText}](${href})`, tag.style ?? []),
        attachments: [],
      };
    }
    case "at":
      return {
        text: getMentionDisplay(tag, context.mentions),
        attachments: [],
      };
    case "img": {
      if (!tag.image_key) {
        return { text: "", attachments: [] };
      }

      if (plainText) {
        return {
          text: "[图片]",
          attachments: [],
        };
      }

      const messageDir = resolveMessageDir(context);
      const filePath = join(messageDir, `${sanitizeFileName(tag.image_key)}.png`);

      mkdirSync(messageDir, { recursive: true });
      try {
        await context.apiClient.downloadResource(
          context.messageId,
          tag.image_key,
          "image",
          filePath,
          context.maxFileSize,
        );
      } catch {
        return {
          text: `[图片下载失败: ${tag.image_key}]`,
          attachments: [],
        };
      }

      return {
        text: `![图片](${filePath})`,
        attachments: [{ type: "image", filePath }],
      };
    }
    case "media": {
      if (plainText) {
        return {
          text: "[视频]",
          attachments: [],
        };
      }

      const attachments: Attachment[] = [];
      const textParts: string[] = [];
      const messageDir = resolveMessageDir(context);

      mkdirSync(messageDir, { recursive: true });

      if (tag.image_key) {
        const coverPath = join(
          messageDir,
          `${sanitizeFileName(tag.image_key)}.png`,
        );
        try {
          await context.apiClient.downloadResource(
            context.messageId,
            tag.image_key,
            "image",
            coverPath,
            context.maxFileSize,
          );
          attachments.push({ type: "image", filePath: coverPath });
        } catch {
          textParts.push(`[图片下载失败: ${tag.image_key}]`);
        }
      }

      if (!tag.file_key) {
        return { text: textParts.join(" "), attachments };
      }

      const filePath = join(messageDir, `${sanitizeFileName(tag.file_key)}.mp4`);
      try {
        await context.apiClient.downloadResource(
          context.messageId,
          tag.file_key,
          "video",
          filePath,
          context.maxFileSize,
        );
        attachments.unshift({ type: "video", filePath });
        textParts.push(`[视频](${filePath})`);
      } catch {
        textParts.push(`[视频下载失败: ${tag.file_key}]`);
      }

      return {
        text: textParts.join(" "),
        attachments,
      };
    }
    case "emotion":
      return {
        text: `:${tag.emoji_type ?? ""}:`,
        attachments: [],
      };
    case "code_block": {
      const language = tag.language ?? "";
      const text = tag.text ?? "";

      return {
        text: plainText ? text : `\`\`\`${language}\n${text}\n\`\`\``,
        attachments: [],
      };
    }
    case "hr":
      return {
        text: "---",
        attachments: [],
      };
    default:
      return {
        text: "",
        attachments: [],
      };
  }
}

export async function extractPostText(
  content: unknown,
  context: HandlerContext,
): Promise<string> {
  const parsedContent = parsePostContent(content);
  const paragraphs: string[] = [];

  for (const paragraph of parsedContent.content ?? []) {
    if (!Array.isArray(paragraph)) {
      continue;
    }

    let paragraphText = "";

    for (const rawTag of paragraph) {
      const rendered = await renderTag(rawTag, context, true);
      paragraphText += rendered.text;
    }

    if (paragraphText) {
      paragraphs.push(paragraphText);
    }
  }

  const body = paragraphs.join("\n");
  const title = parsedContent.title?.trim();

  return title ? [title, body].filter(Boolean).join("\n") : body;
}

export async function handlePost(
  content: unknown,
  context: HandlerContext,
): Promise<HandlerResult> {
  const parsedContent = parsePostContent(content);
  const attachments: Attachment[] = [];
  const paragraphs: string[] = [];

  for (const paragraph of parsedContent.content ?? []) {
    if (!Array.isArray(paragraph)) {
      continue;
    }

    let paragraphText = "";

    for (const rawTag of paragraph) {
      const rendered = await renderTag(rawTag, context);
      paragraphText += rendered.text;
      attachments.push(...rendered.attachments);
    }

    paragraphs.push(paragraphText);
  }

  const body = paragraphs.join("\n");
  const title = parsedContent.title?.trim();
  const text = title ? `### ${title}${body ? `\n\n${body}` : ""}` : body;

  return {
    text,
    attachments,
  };
}
