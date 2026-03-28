import { tmpdir } from "node:os";

import { describe, expect, it, vi } from "vitest";

import { getHandler } from "../../../src/handlers/index.js";
import { handlePost } from "../../../src/handlers/post.js";
import type {
  FeishuApiClient,
  HandlerContext,
  Mention,
} from "../../../src/types.js";
import { sanitizeFileName } from "../../../src/utils/sanitize.js";

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

function createContext(overrides: Partial<HandlerContext> = {}): HandlerContext {
  return {
    apiClient: createApiClient(),
    mentions: [],
    messageId: "msg_123",
    messageType: "post",
    downloadDir: "/tmp",
    convertMessageBody: vi.fn(),
    depth: 0,
    ...overrides,
  };
}

describe("handlePost", () => {
  it("renders a title", async () => {
    const result = await handlePost(
      {
        title: "项目周报",
        content: [[{ tag: "text", text: "正文", style: [] }]],
      },
      createContext(),
    );

    expect(result).toEqual({
      text: "### 项目周报\n\n正文",
      attachments: [],
    });
  });

  it("stacks text styles", async () => {
    const result = await handlePost(
      {
        content: [
          [[{ tag: "text", text: "重点", style: ["bold", "italic"] }]].flat(),
        ],
      },
      createContext(),
    );

    expect(result).toEqual({
      text: "***重点***",
      attachments: [],
    });
  });

  it("replaces at tags with open_id", async () => {
    const mentions: Mention[] = [
      {
        key: "@_user_1",
        id: {
          union_id: "on_1",
          user_id: "u_1",
          open_id: "ou_1",
        },
        name: "张三",
        tenant_key: "tenant",
      },
    ];

    const result = await handlePost(
      {
        content: [
          [
            { tag: "at", user_id: "@_user_1", user_name: "张三" },
            { tag: "text", text: " 请处理", style: [] },
          ],
        ],
      },
      createContext({ mentions }),
    );

    expect(result).toEqual({
      text: "@张三(ou_1) 请处理",
      attachments: [],
    });
  });

  it("renders links", async () => {
    const result = await handlePost(
      {
        content: [
          [
            {
              tag: "a",
              text: "文档",
              href: "https://example.com",
              style: [],
            },
          ],
        ],
      },
      createContext(),
    );

    expect(result).toEqual({
      text: "[文档](https://example.com)",
      attachments: [],
    });
  });

  it("falls back to mention key when mention mapping is missing", async () => {
    const result = await handlePost(
      {
        content: [
          [
            { tag: "at", user_id: "@_user_1" },
            { tag: "text", text: " 请处理", style: [] },
          ],
        ],
      },
      createContext(),
    );

    expect(result).toEqual({
      text: "@_user_1 请处理",
      attachments: [],
    });
  });

  it("renders code blocks", async () => {
    const result = await handlePost(
      {
        content: [
          [
            {
              tag: "code_block",
              language: "python",
              text: "print('hello')",
            },
          ],
        ],
      },
      createContext(),
    );

    expect(result).toEqual({
      text: "```python\nprint('hello')\n```",
      attachments: [],
    });
  });

  it("joins multiple paragraphs with newlines", async () => {
    const result = await handlePost(
      {
        content: [
          [{ tag: "text", text: "第一段", style: [] }],
          [{ tag: "text", text: "第二段", style: [] }],
        ],
      },
      createContext(),
    );

    expect(result).toEqual({
      text: "第一段\n第二段",
      attachments: [],
    });
  });

  it("registers the post handler", () => {
    expect(getHandler("post")).toBe(handlePost);
  });

  it("sanitizes embedded attachment paths before download", async () => {
    const context = createContext({
      messageId: "msg/123",
      downloadDir: tmpdir(),
    });

    await handlePost(
      {
        content: [
          [
            { tag: "img", image_key: "../cover" },
            { tag: "media", file_key: "../../video", image_key: "..\\thumb" },
          ],
        ],
      },
      context,
    );

    expect(context.apiClient.downloadResource).toHaveBeenNthCalledWith(
      1,
      "msg/123",
      "../cover",
      "image",
      `${tmpdir()}/${sanitizeFileName("msg/123")}/${sanitizeFileName("../cover")}.png`,
      undefined,
    );
    expect(context.apiClient.downloadResource).toHaveBeenNthCalledWith(
      2,
      "msg/123",
      "..\\thumb",
      "image",
      `${tmpdir()}/${sanitizeFileName("msg/123")}/${sanitizeFileName("..\\thumb")}.png`,
      undefined,
    );
    expect(context.apiClient.downloadResource).toHaveBeenNthCalledWith(
      3,
      "msg/123",
      "../../video",
      "video",
      `${tmpdir()}/${sanitizeFileName("msg/123")}/${sanitizeFileName("../../video")}.mp4`,
      undefined,
    );
  });

  it("returns fallback text when embedded image download fails", async () => {
    const context = createContext();
    vi.mocked(context.apiClient.downloadResource).mockRejectedValue(
      new Error("boom"),
    );

    await expect(
      handlePost(
        {
          content: [[{ tag: "img", image_key: "img_123" }]],
        },
        context,
      ),
    ).resolves.toEqual({
      text: "[图片下载失败: img_123]",
      attachments: [],
    });
  });

  it("returns fallback text when embedded media download fails", async () => {
    const context = createContext({
      messageId: "msg/123",
      downloadDir: tmpdir(),
    });
    vi.mocked(context.apiClient.downloadResource).mockImplementation(
      async (_messageId, fileKey) => {
        if (fileKey === "../../video") {
          throw new Error("boom");
        }
      },
    );

    await expect(
      handlePost(
        {
          content: [
            [
              { tag: "media", file_key: "../../video", image_key: "..\\thumb" },
            ],
          ],
        },
        context,
      ),
    ).resolves.toEqual({
      text: "[视频下载失败: ../../video]",
      attachments: [
        {
          type: "image",
          filePath: `${tmpdir()}/${sanitizeFileName("msg/123")}/${sanitizeFileName("..\\thumb")}.png`,
        },
      ],
    });
  });
});
