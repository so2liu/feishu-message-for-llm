const SUPPORTED_STYLES = new Set([
  "bold",
  "italic",
  "underline",
  "lineThrough",
]);

export function applyStyles(text: string, styles: string[]): string {
  const activeStyles = new Set(
    styles.filter((style) => SUPPORTED_STYLES.has(style)),
  );

  let result = text;

  if (activeStyles.has("bold") && activeStyles.has("italic")) {
    result = `***${result}***`;
  } else if (activeStyles.has("bold")) {
    result = `**${result}**`;
  } else if (activeStyles.has("italic")) {
    result = `*${result}*`;
  }

  if (activeStyles.has("underline")) {
    result = `<u>${result}</u>`;
  }

  if (activeStyles.has("lineThrough")) {
    result = `~~${result}~~`;
  }

  return result;
}
