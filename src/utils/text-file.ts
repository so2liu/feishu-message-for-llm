const TEXT_FILE_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".jsonl",
  ".csv",
  ".tsv",
  ".log",
  ".xml",
  ".yaml",
  ".yml",
  ".html",
  ".htm",
  ".css",
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".ts",
  ".mts",
  ".cts",
  ".tsx",
  ".py",
  ".sh",
  ".bash",
  ".zsh",
  ".sql",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".properties",
]);

const TEXT_FILE_NAMES = new Set([".gitignore"]);

export function isTextFile(fileName: string): boolean {
  const lowerFileName = fileName.toLowerCase();

  if (TEXT_FILE_NAMES.has(lowerFileName)) {
    return true;
  }

  if (/^\.env(\..+)?$/i.test(fileName)) {
    return true;
  }

  const lastDotIndex = lowerFileName.lastIndexOf(".");

  if (lastDotIndex <= 0) {
    return false;
  }

  return TEXT_FILE_EXTENSIONS.has(lowerFileName.slice(lastDotIndex));
}
