const RESERVED_FILE_NAME_PATTERN = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
const MAX_FILE_NAME_LENGTH = 200;

export function sanitizeFileName(name: string): string {
  if (!name) {
    return "unnamed";
  }

  let safe = name
    .replace(/[/\\]/g, "_")
    .replace(/[<>:"|?*\x00-\x1f]/g, "_")
    .replace(/^[.\s]+|[.\s]+$/g, "_");

  if (!safe) {
    return "unnamed";
  }

  const extensionIndex = safe.lastIndexOf(".");
  const baseName =
    extensionIndex > 0 ? safe.slice(0, extensionIndex) : safe;

  if (RESERVED_FILE_NAME_PATTERN.test(baseName)) {
    safe = `_${safe}`;
  }

  if (safe.length > MAX_FILE_NAME_LENGTH) {
    const lastDotIndex = safe.lastIndexOf(".");

    if (lastDotIndex > 0 && lastDotIndex < safe.length - 1) {
      const extension = safe.slice(lastDotIndex);
      const truncatedBase = safe.slice(0, lastDotIndex);
      const maxBaseLength = Math.max(1, MAX_FILE_NAME_LENGTH - extension.length);

      safe = `${truncatedBase.slice(0, maxBaseLength)}${extension}`;
    } else {
      safe = safe.slice(0, MAX_FILE_NAME_LENGTH);
    }
  }

  return safe || "unnamed";
}
