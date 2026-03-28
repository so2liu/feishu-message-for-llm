import type { HandlerContext, HandlerResult } from "../types.js";
import { enrichTextWithDocLinks } from "../utils/doc-link.js";
import { parseJsonRecord } from "../utils/json.js";
import { replaceMentions } from "../utils/mention.js";

interface TextContent {
  text: string;
}

function parseTextContent(content: unknown): TextContent {
  const parsed = parseJsonRecord(content);

  if (
    !parsed ||
    typeof parsed.text !== "string"
  ) {
    return { text: "" };
  }

  return { text: parsed.text };
}

export async function handleText(
  content: unknown,
  context: HandlerContext,
): Promise<HandlerResult> {
  const { text } = parseTextContent(content);
  const replacedText = replaceMentions(text, context.mentions);
  const enrichedText = await enrichTextWithDocLinks(
    replacedText,
    context.apiClient,
  );

  return {
    text: enrichedText,
    attachments: [],
  };
}
