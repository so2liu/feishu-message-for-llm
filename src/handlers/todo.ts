import type { HandlerContext, HandlerResult } from "../types.js";
import { parseJsonRecord } from "../utils/json.js";
import { formatTimestamp } from "../utils/time.js";
import { extractPostText } from "./post.js";

interface TodoContent {
  task_id?: string;
  summary?: unknown;
  due_time?: string;
}

function parseTodoContent(content: unknown): TodoContent {
  const parsed = parseJsonRecord(content);

  if (!parsed) {
    return {};
  }

  return {
    task_id: typeof parsed.task_id === "string" ? parsed.task_id : undefined,
    summary: parsed.summary,
    due_time:
      typeof parsed.due_time === "string"
        ? parsed.due_time
        : typeof parsed.due_time === "number"
          ? String(parsed.due_time)
          : undefined,
  };
}

function normalizeSummary(summary: string, fallback = ""): string {
  const normalized = summary.replace(/\s+/g, " ").trim();

  return normalized || fallback;
}

export async function handleTodo(
  content: unknown,
  context: HandlerContext,
): Promise<HandlerResult> {
  const { task_id, summary, due_time } = parseTodoContent(content);
  const summaryText = summary ? await extractPostText(summary, context) : "";

  return {
    text: `[任务: ${normalizeSummary(summaryText, task_id ?? "")}, 截止: ${formatTimestamp(due_time ?? "")}]`,
    attachments: [],
  };
}
