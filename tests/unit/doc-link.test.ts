import { describe, expect, it, vi } from "vitest";

import type { FeishuApiClient } from "../../src/types.js";
import {
  FEISHU_DOC_PATTERN,
  enrichTextWithDocLinks,
  parseDocUrl,
} from "../../src/utils/doc-link.js";

function createApiClient(): FeishuApiClient {
  return {
    getTenantAccessToken: vi.fn(),
    getUserInfo: vi.fn(),
    getChatInfo: vi.fn(),
    getMessage: vi.fn(),
    getMergeForwardMessages: vi.fn(),
    downloadResource: vi.fn(),
    getDocMeta: vi.fn(),
  };
}

describe("FEISHU_DOC_PATTERN", () => {
  it("matches feishu.cn and larksuite.com document urls", () => {
    const text =
      "https://team.feishu.cn/docx/abc123 和 https://foo.larksuite.com/wiki/def456";
    const matches = text.match(FEISHU_DOC_PATTERN);

    expect(matches).toEqual([
      "https://team.feishu.cn/docx/abc123",
      "https://foo.larksuite.com/wiki/def456",
    ]);
  });
});

describe("parseDocUrl", () => {
  it("extracts doc type and token", () => {
    expect(parseDocUrl("https://team.feishu.cn/sheets/shtcn123?from=msg")).toEqual(
      {
        docToken: "shtcn123",
        docType: "sheets",
      },
    );
  });

  it("returns null for non-feishu urls", () => {
    expect(parseDocUrl("https://example.com/docx/abc123")).toBeNull();
  });
});

describe("enrichTextWithDocLinks", () => {
  it("replaces raw urls with markdown links using document titles", async () => {
    const apiClient = createApiClient();
    vi.mocked(apiClient.getDocMeta).mockResolvedValue({ title: "需求文档 v2.0" });

    const enriched = await enrichTextWithDocLinks(
      "看这个 https://team.feishu.cn/docx/abc123",
      apiClient,
    );

    expect(enriched).toBe(
      "看这个 [需求文档 v2.0](https://team.feishu.cn/docx/abc123)",
    );
    expect(apiClient.getDocMeta).toHaveBeenCalledWith("abc123", "docx");
  });

  it("keeps the original url when title lookup fails", async () => {
    const apiClient = createApiClient();
    vi.mocked(apiClient.getDocMeta).mockRejectedValue(new Error("boom"));

    const text = "看这个 https://team.feishu.cn/wiki/abc123";

    await expect(enrichTextWithDocLinks(text, apiClient)).resolves.toBe(text);
  });

  it("deduplicates repeated urls", async () => {
    const apiClient = createApiClient();
    vi.mocked(apiClient.getDocMeta).mockResolvedValue({ title: "设计文档" });

    const text =
      "https://team.feishu.cn/docs/abc123 再看一次 https://team.feishu.cn/docs/abc123";

    const enriched = await enrichTextWithDocLinks(text, apiClient);

    expect(enriched).toBe(
      "[设计文档](https://team.feishu.cn/docs/abc123) 再看一次 [设计文档](https://team.feishu.cn/docs/abc123)",
    );
    expect(apiClient.getDocMeta).toHaveBeenCalledTimes(1);
    expect(apiClient.getDocMeta).toHaveBeenCalledWith("abc123", "docs");
  });
});
