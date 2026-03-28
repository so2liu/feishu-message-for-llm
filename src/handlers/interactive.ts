import type { HandlerContext, HandlerResult } from "../types.js";
import { parseJsonRecord, parseJsonValue } from "../utils/json.js";

interface InteractiveTemplateCard {
  type?: string;
  data?: {
    template_id?: string;
    template_variable?: unknown;
  };
}

interface InteractiveRawCard {
  header?: {
    title?: unknown;
  };
  elements?: unknown[];
}

const IGNORED_STRING_KEYS = new Set([
  "tag",
  "type",
  "template",
  "template_id",
  "url",
  "href",
  "icon",
  "img_key",
  "image_key",
  "value",
  "action_type",
  "behavior",
  "layout",
  "mode",
  "size",
  "style",
  "width",
  "height",
]);

function parseInteractiveContent(content: unknown): unknown {
  const parsed = parseJsonRecord(content);

  if (!parsed) {
    return {};
  }

  if (typeof parsed.card === "string") {
    const card = parseJsonValue(parsed.card);

    return card && typeof card === "object" ? card : {};
  }

  if (parsed.card && typeof parsed.card === "object") {
    return parsed.card;
  }

  return parsed;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function addUnique(target: string[], value: string): void {
  const normalized = normalizeText(value);

  if (!normalized || target.includes(normalized)) {
    return;
  }

  target.push(normalized);
}

function extractTextValue(value: unknown): string {
  if (typeof value === "string") {
    return normalizeText(value);
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  const record = value as Record<string, unknown>;

  if (typeof record.content === "string") {
    return normalizeText(record.content);
  }

  if (typeof record.text === "string") {
    return normalizeText(record.text);
  }

  const parts: string[] = [];

  for (const child of Object.values(record)) {
    const extracted = extractTextValue(child);

    if (extracted) {
      parts.push(extracted);
    }
  }

  return normalizeText(parts.join(" "));
}

function collectStringValues(
  value: unknown,
  target: string[],
  parentKey?: string,
  ignoredKeys = IGNORED_STRING_KEYS,
): void {
  if (typeof value === "string") {
    if (!parentKey || !ignoredKeys.has(parentKey)) {
      addUnique(target, value);
    }

    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStringValues(item, target, parentKey, ignoredKeys);
    }

    return;
  }

  for (const [key, child] of Object.entries(value)) {
    collectStringValues(child, target, key, ignoredKeys);
  }
}

function collectButtonTexts(value: unknown, target: string[]): void {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectButtonTexts(item, target);
    }

    return;
  }

  const record = value as Record<string, unknown>;

  if (record.tag === "button") {
    const buttonText = extractTextValue(record.text);

    if (buttonText) {
      addUnique(target, buttonText);
    }
  }

  for (const child of Object.values(record)) {
    collectButtonTexts(child, target);
  }
}

function collectBodyTexts(value: unknown, target: string[]): void {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectBodyTexts(item, target);
    }

    return;
  }

  const record = value as Record<string, unknown>;

  if (record.tag === "div" || record.tag === "markdown" || record.tag === "note") {
    const directText = extractTextValue(record.text);

    if (directText) {
      addUnique(target, directText);
    }

    if (Array.isArray(record.fields)) {
      for (const field of record.fields) {
        const fieldText = extractTextValue(field);

        if (fieldText) {
          addUnique(target, fieldText);
        }
      }
    }
  }

  for (const child of Object.values(record)) {
    collectBodyTexts(child, target);
  }
}

function renderRawCard(card: InteractiveRawCard): string {
  const title = extractTextValue(card.header?.title);
  const bodyTexts: string[] = [];
  const buttonTexts: string[] = [];
  const fallbackTexts: string[] = [];

  collectBodyTexts(card.elements, bodyTexts);
  collectButtonTexts(card.elements, buttonTexts);
  collectStringValues(card, fallbackTexts);

  const consumed = new Set<string>([
    title,
    ...bodyTexts,
    ...buttonTexts,
    "[卡片消息]",
  ]);

  const lines = ["[卡片消息]"];

  if (title) {
    lines.push(`**${title}**`);
  }

  for (const bodyText of bodyTexts) {
    lines.push(bodyText);
  }

  for (const fallbackText of fallbackTexts) {
    if (!consumed.has(fallbackText)) {
      consumed.add(fallbackText);
      lines.push(fallbackText);
    }
  }

  if (buttonTexts.length > 0) {
    lines.push(`按钮：${buttonTexts.map((text) => `[${text}]`).join(" ")}`);
  }

  return lines.join("\n");
}

function renderTemplateCard(card: InteractiveTemplateCard): string {
  const templateId = normalizeText(card.data?.template_id ?? "");
  const variableTexts: string[] = [];

  collectStringValues(card.data?.template_variable, variableTexts, undefined, new Set([
    "tag",
    "type",
    "template",
    "template_id",
    "url",
    "href",
    "icon",
    "img_key",
    "image_key",
    "action_type",
    "behavior",
    "layout",
    "mode",
    "size",
    "style",
    "width",
    "height",
  ]));

  const lines = [`[卡片消息: ${templateId}]`];

  for (const text of variableTexts) {
    lines.push(text);
  }

  return lines.join("\n");
}

export async function handleInteractive(
  content: unknown,
  _context: HandlerContext,
): Promise<HandlerResult> {
  const parsedContent = parseInteractiveContent(content);
  const card = parsedContent as InteractiveTemplateCard & InteractiveRawCard;
  const text =
    card.type === "template"
      ? renderTemplateCard(card)
      : renderRawCard(card);

  return {
    text,
    attachments: [],
  };
}
