import { describe, expect, it, vi } from "vitest";

import { getHandler } from "../../../src/handlers/index.js";
import { handleVote } from "../../../src/handlers/vote.js";
import type { FeishuApiClient, HandlerContext } from "../../../src/types.js";

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

function createContext(): HandlerContext {
  return {
    apiClient: createApiClient(),
    mentions: [],
    messageId: "msg_123",
    messageType: "vote",
    downloadDir: "/tmp",
    convertMessageBody: vi.fn(),
    depth: 0,
  };
}

describe("handleVote", () => {
  it("formats vote topic and options", async () => {
    await expect(
      handleVote(
        {
          topic: "团建去哪里",
          options: ["三亚", "丽江", "西双版纳"],
        },
        createContext(),
      ),
    ).resolves.toEqual({
      text: "[投票: 团建去哪里]\n- 三亚\n- 丽江\n- 西双版纳",
      attachments: [],
    });
  });

  it("registers the vote handler", () => {
    expect(getHandler("vote")).toBe(handleVote);
  });
});
