import type { FeishuApiClient } from "../types.js";

const FEISHU_DOC_TYPES = new Set([
  "docs",
  "docx",
  "sheets",
  "wiki",
  "base",
  "mindnotes",
  "slides",
  "bitable",
]);

export const FEISHU_DOC_PATTERN =
  /https?:\/\/[a-zA-Z0-9-]+\.(?:feishu\.cn|larksuite\.com)\/(?:docs|docx|sheets|wiki|base|mindnotes|slides|bitable)\/[a-zA-Z0-9_-]+(?:\?[^\s)\]}>,，。！？；：]*)?(?:#[^\s)\]}>,，。！？；：]*)?/gi;

export function parseDocUrl(
  url: string,
): { docToken: string; docType: string } | null {
  try {
    const parsedUrl = new URL(url);

    if (
      !parsedUrl.hostname.endsWith(".feishu.cn") &&
      !parsedUrl.hostname.endsWith(".larksuite.com")
    ) {
      return null;
    }

    const [docType, docToken] = parsedUrl.pathname
      .split("/")
      .filter(Boolean);

    if (!docType || !docToken || !FEISHU_DOC_TYPES.has(docType)) {
      return null;
    }

    return { docToken, docType };
  } catch {
    return null;
  }
}

export async function enrichTextWithDocLinks(
  text: string,
  apiClient: FeishuApiClient,
): Promise<string> {
  const matches = Array.from(text.matchAll(FEISHU_DOC_PATTERN));

  if (matches.length === 0) {
    return text;
  }

  const uniqueUrls = [...new Set(matches.map((match) => match[0]))];
  const replacementEntries = await Promise.all(
    uniqueUrls.map(async (url) => {
      const parsed = parseDocUrl(url);

      if (!parsed) {
        return null;
      }

      try {
        const metadata = await apiClient.getDocMeta(parsed.docToken, parsed.docType);

        return metadata.title ? [url, `[${metadata.title}](${url})`] as const : null;
      } catch {
        return null;
      }
    }),
  );
  const replacements = new Map<string, string>(
    replacementEntries.flatMap((entry) => (entry ? [entry] : [])),
  );

  let result = text;

  for (const [url, replacement] of replacements) {
    result = result.replaceAll(url, replacement);
  }

  return result;
}
