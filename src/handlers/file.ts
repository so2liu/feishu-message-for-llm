import { mkdirSync } from "node:fs";
import { open } from "node:fs/promises";
import { extname, join } from "node:path";

import type { HandlerContext, HandlerResult } from "../types.js";
import { parseJsonRecord } from "../utils/json.js";
import { sanitizeFileName } from "../utils/sanitize.js";
import { isTextFile } from "../utils/text-file.js";

const MAX_TEXT_FILE_PREVIEW_BYTES = 64 * 1024;

interface FileContent {
  file_key?: string;
  file_name?: string;
}

function parseFileContent(content: unknown): FileContent {
  const parsed = parseJsonRecord(content);

  if (!parsed) {
    return {};
  }

  return {
    file_key: typeof parsed.file_key === "string" ? parsed.file_key : undefined,
    file_name:
      typeof parsed.file_name === "string" ? parsed.file_name : undefined,
  };
}

function getCodeBlockLanguage(fileName: string): string {
  return extname(fileName).slice(1);
}

async function readTextFilePreview(filePath: string): Promise<{
  content: string;
  truncated: boolean;
}> {
  const file = await open(filePath, "r");

  try {
    const buffer = Buffer.alloc(MAX_TEXT_FILE_PREVIEW_BYTES + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    const truncated = bytesRead > MAX_TEXT_FILE_PREVIEW_BYTES;
    const content = buffer
      .subarray(0, Math.min(bytesRead, MAX_TEXT_FILE_PREVIEW_BYTES))
      .toString("utf8");

    return {
      content,
      truncated,
    };
  } finally {
    await file.close();
  }
}

export async function handleFile(
  content: unknown,
  context: HandlerContext,
): Promise<HandlerResult> {
  const { file_key, file_name } = parseFileContent(content);
  const resolvedFileName = file_name || file_key || "unnamed";
  const messageDir = join(context.downloadDir, sanitizeFileName(context.messageId));
  const filePath = join(messageDir, sanitizeFileName(resolvedFileName));

  mkdirSync(messageDir, { recursive: true });

  await context.apiClient.downloadResource(
    context.messageId,
    file_key ?? resolvedFileName,
    "file",
    filePath,
    context.maxFileSize,
  );

  let text = `[文件: ${resolvedFileName}](${filePath})`;

  if (isTextFile(resolvedFileName)) {
    try {
      const { content: fileContent, truncated } = await readTextFilePreview(filePath);
      const language = getCodeBlockLanguage(resolvedFileName);
      const fence = language ? `\`\`\`${language}` : "```";
      const truncationNote = truncated
        ? `\n[内容已截断，预览前 ${MAX_TEXT_FILE_PREVIEW_BYTES} 字节]`
        : "";

      text +=
        `\n\n<${resolvedFileName} 内容>\n` +
        `${fence}\n${fileContent}\n\`\`\`${truncationNote}\n` +
        `</${resolvedFileName} 内容>`;
    } catch {
      // Keep the file link even if preview generation fails.
    }
  }

  return {
    text,
    attachments: [
      {
        type: "file",
        filePath,
        fileName: resolvedFileName,
      },
    ],
  };
}
