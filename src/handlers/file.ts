import { extname } from "node:path";
import type { HandlerContext, HandlerResult } from "../types.js";
import { parseJsonRecord } from "../utils/json.js";
import { resolveResource, resourceLink, resourceFailure, MAX_TEXT_FILE_PREVIEW_BYTES } from "../utils/resource.js";
import { isTextFile } from "../utils/text-file.js";

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

export async function handleFile(content: unknown, context: HandlerContext): Promise<HandlerResult> {
  const { file_key, file_name } = parseFileContent(content);
  const resolvedFileName = file_name || file_key || "unnamed";
  if (context.downloadResources === false) return { text: `[文件: ${resolvedFileName}]`, attachments: [] };
  const resourceKey = file_key ?? resolvedFileName;
  try {
    const { attachment, textPreview } = await resolveResource(context, {
      fileKey: resourceKey, type: "file", fileName: resolvedFileName,
    }, resolvedFileName);
    let text = `[文件: ${resolvedFileName}](${resourceLink(attachment)})`;
    if (isTextFile(resolvedFileName) && textPreview) {
      const language = getCodeBlockLanguage(resolvedFileName);
      const fence = "```" + language;
      const note = textPreview.truncated ? `\n[内容已截断，预览前 ${MAX_TEXT_FILE_PREVIEW_BYTES} 字节]` : "";
      text += `\n\n<${resolvedFileName} 内容>\n${fence}\n${textPreview.content}\n` + "```" + `${note}\n</${resolvedFileName} 内容>`;
    }
    return { text, attachments: [attachment] };
  } catch (error) {
    return { text: `[文件下载失败: ${resourceKey}]`, attachments: [], ...resourceFailure(error) };
  }
}
