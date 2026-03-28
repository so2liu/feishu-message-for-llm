import { describe, expect, it } from "vitest";

import { formatTimestamp } from "../../src/utils/time.js";

describe("formatTimestamp", () => {
  it("formats milliseconds timestamp using UTC", () => {
    expect(formatTimestamp("1704067199000")).toBe("2023-12-31 23:59");
  });

  it("returns empty string for invalid timestamps", () => {
    expect(formatTimestamp("not-a-number")).toBe("");
  });
});
