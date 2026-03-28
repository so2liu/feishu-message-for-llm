import { describe, expect, it } from "vitest";

import { applyStyles } from "../../src/utils/style.js";

describe("applyStyles", () => {
  it("applies single markdown styles", () => {
    expect(applyStyles("text", ["bold"])).toBe("**text**");
    expect(applyStyles("text", ["italic"])).toBe("*text*");
    expect(applyStyles("text", ["underline"])).toBe("<u>text</u>");
    expect(applyStyles("text", ["lineThrough"])).toBe("~~text~~");
  });

  it("stacks styles in a stable order", () => {
    expect(applyStyles("text", ["bold", "italic"])).toBe("***text***");
    expect(applyStyles("text", ["bold", "italic", "underline"])).toBe(
      "<u>***text***</u>",
    );
    expect(
      applyStyles("text", ["lineThrough", "underline", "bold", "italic"]),
    ).toBe("~~<u>***text***</u>~~");
  });

  it("ignores unsupported styles", () => {
    expect(applyStyles("text", ["unknown"])).toBe("text");
  });
});
