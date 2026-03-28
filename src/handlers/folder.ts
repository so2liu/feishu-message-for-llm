import type { HandlerContext, HandlerResult } from "../types.js";
import { parseJsonRecord } from "../utils/json.js";

interface FolderContent {
  file_key?: string;
  file_name: string;
}

function parseFolderContent(content: unknown): FolderContent {
  const parsed = parseJsonRecord(content);

  if (!parsed) {
    return { file_name: "" };
  }

  return {
    file_key: typeof parsed.file_key === "string" ? parsed.file_key : undefined,
    file_name: typeof parsed.file_name === "string" ? parsed.file_name : "",
  };
}

export async function handleFolder(
  content: unknown,
  _context: HandlerContext,
): Promise<HandlerResult> {
  const { file_name } = parseFolderContent(content);

  return {
    text: `[文件夹: ${file_name}]`,
    attachments: [],
  };
}
