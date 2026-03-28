import type { Mention } from "../types.js";

export function replaceMentions(text: string, mentions: Mention[]): string {
  const replacements = mentions
    .filter((mention) => mention.key.length > 0)
    .map((mention) => ({
      key: mention.key,
      display: `@${mention.name}(${mention.id.open_id})`,
    }))
    .sort((left, right) => right.key.length - left.key.length);

  let result = text;

  for (const { key, display } of replacements) {
    result = result.replaceAll(key, display);
  }

  return result.replaceAll("@_all", "@所有人");
}
