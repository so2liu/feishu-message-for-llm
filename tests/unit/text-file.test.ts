import { describe, expect, it } from "vitest";

import { isTextFile } from "../../src/utils/text-file.js";

describe("isTextFile", () => {
  it("recognizes text file extensions", () => {
    expect(isTextFile("readme.md")).toBe(true);
    expect(isTextFile("script.TS")).toBe(true);
    expect(isTextFile("error.log")).toBe(true);
  });

  it("recognizes text-based dotfiles", () => {
    expect(isTextFile(".gitignore")).toBe(true);
    expect(isTextFile(".env.production")).toBe(true);
  });

  it("rejects binary-looking files", () => {
    expect(isTextFile("archive.zip")).toBe(false);
    expect(isTextFile("image.png")).toBe(false);
  });
});
