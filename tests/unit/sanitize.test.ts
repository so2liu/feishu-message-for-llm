import { describe, expect, it } from "vitest";

import { sanitizeFileName } from "../../src/utils/sanitize.js";

describe("sanitizeFileName", () => {
  it("replaces path separators and illegal characters", () => {
    expect(sanitizeFileName("../a/b:c?.txt")).toBe("__a_b_c_.txt");
  });

  it("prefixes reserved windows file names", () => {
    expect(sanitizeFileName("CON.txt")).toBe("_CON.txt");
    expect(sanitizeFileName("nul")).toBe("_nul");
  });

  it("truncates long names while preserving the extension", () => {
    const name = `${"a".repeat(210)}.json`;
    const sanitized = sanitizeFileName(name);

    expect(sanitized.length).toBeLessThanOrEqual(200);
    expect(sanitized.endsWith(".json")).toBe(true);
  });

  it("falls back to unnamed for empty input", () => {
    expect(sanitizeFileName("")).toBe("unnamed");
  });
});
