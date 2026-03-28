import type { HandlerContext, HandlerResult } from "../types.js";
import { parseJsonRecord } from "../utils/json.js";

type TemplateRecord = Record<string, unknown>;

function parseSystemContent(content: unknown): TemplateRecord {
  return parseJsonRecord(content) ?? {};
}

function stringifyTemplateValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => stringifyTemplateValue(item)).filter(Boolean).join("、");
  }

  if (value && typeof value === "object") {
    const record = value as TemplateRecord;

    for (const key of [
      "name",
      "user_name",
      "display_name",
      "chat_name",
      "title",
      "summary",
      "topic",
      "text",
      "open_id",
      "id",
    ]) {
      const candidate = record[key];

      if (
        typeof candidate === "string" ||
        typeof candidate === "number" ||
        typeof candidate === "boolean"
      ) {
        return String(candidate);
      }
    }

    return Object.values(record)
      .map((item) => stringifyTemplateValue(item))
      .filter(Boolean)
      .join(" ");
  }

  return "";
}

function collectTemplateValues(
  record: TemplateRecord,
  prefix = "",
  values = new Map<string, string>(),
): Map<string, string> {
  for (const [key, value] of Object.entries(record)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const stringValue = stringifyTemplateValue(value);

    if (stringValue) {
      values.set(path, stringValue);
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      collectTemplateValues(value as TemplateRecord, path, values);
    }
  }

  return values;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fillTemplate(template: string, values: Map<string, string>): string {
  let filled = template;
  const entries = [...values.entries()].sort((left, right) => right[0].length - left[0].length);

  for (const [key, value] of entries) {
    const escapedKey = escapeRegExp(key);

    filled = filled
      .replace(new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, "g"), value)
      .replace(new RegExp(`\\$\\{\\s*${escapedKey}\\s*\\}`, "g"), value)
      .replace(new RegExp(`\\{\\s*${escapedKey}\\s*\\}`, "g"), value);
  }

  return filled.replace(/\s+/g, " ").trim();
}

function buildFallbackText(record: TemplateRecord): string {
  return Object.entries(record)
    .filter(([key]) => key !== "template")
    .map(([key, value]) => `${key}: ${stringifyTemplateValue(value)}`)
    .filter((item) => !item.endsWith(": "))
    .join(", ");
}

export async function handleSystem(
  content: unknown,
  _context: HandlerContext,
): Promise<HandlerResult> {
  const parsedContent = parseSystemContent(content);
  const template =
    typeof parsedContent.template === "string" ? parsedContent.template : "";
  const templateValues = collectTemplateValues(parsedContent);
  const filledText = template
    ? fillTemplate(template, templateValues)
    : buildFallbackText(parsedContent);

  return {
    text: `[系统消息: ${filledText}]`,
    attachments: [],
  };
}
