import { mkdirSync } from "node:fs";
import { mkdir, open } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import { FeishuMessageConverter } from "../../src/index.js";
import type { FeishuApiMessage, FeishuDataProvider, FeishuMessageEvent } from "../../src/index.js";

vi.mock("node:fs", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:fs")>(),
  mkdirSync: vi.fn(() => { throw new Error("Unexpected local directory"); }),
}));
vi.mock("node:fs/promises", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:fs/promises")>(),
  mkdir: vi.fn(() => { throw new Error("Unexpected local directory"); }),
  open: vi.fn(() => { throw new Error("Unexpected local file read"); }),
}));

function message(id: string, type = "text", content: unknown = { text: "hello" }): FeishuApiMessage {
  return {
    message_id: id, msg_type: type, create_time: "1000", update_time: "1000",
    chat_id: "chat", sender: { id: "user", id_type: "open_id", sender_type: "user", tenant_key: "tenant" },
    body: { content: JSON.stringify(content) },
  };
}

function event(input: FeishuApiMessage): FeishuMessageEvent {
  return {
    sender: { sender_id: { open_id: input.sender.id, union_id: "", user_id: "" }, sender_type: input.sender.sender_type, tenant_key: "tenant" },
    message: {
      ...input, message_type: input.msg_type, content: input.body.content, chat_type: "group", mentions: [],
    },
  };
}

function provider(name = "Alice"): FeishuDataProvider {
  return {
    getUserInfo: vi.fn(async () => ({ name })),
    getChatInfo: vi.fn(async () => ({ name: "Team" })),
    getMessage: vi.fn(async (id) => message(id)),
    getMergeForwardMessages: vi.fn(async () => []),
    getDocMeta: vi.fn(async () => ({ title: "Design" })),
    getChatMemberNames: vi.fn(async () => new Map([["user", "Member"]])),
    getBotName: vi.fn(async () => "Helper"),
    listChatMessages: vi.fn(async () => ({ items: [], hasMore: false })),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("host data provider", () => {
  it("routes events, API messages, history and nested lookups exclusively to the host", async () => {
    const fetch = vi.fn(() => { throw new Error("Unexpected direct Feishu request"); });
    vi.stubGlobal("fetch", fetch);
    const host = provider();
    const parent = message("parent", "text", { text: "https://team.feishu.cn/docx/doc_token" });
    const bot = message("bot");
    bot.sender = { ...bot.sender, id: "app", sender_type: "app" };
    const forwarded = message("forward", "merge_forward", {});
    const rich = message("rich", "post", { content: [[
      { tag: "a", href: "https://team.feishu.cn/docx/doc_token" },
      { tag: "at", user_id: "person", user_name: "Bob" },
    ]] });
    vi.mocked(host.getMessage).mockResolvedValue(parent);
    vi.mocked(host.getMergeForwardMessages).mockResolvedValue([
      message("share", "share_chat", { chat_id: "shared" }),
      message("person", "share_user", { user_id: "person" }), rich,
    ]);
    vi.mocked(host.listChatMessages).mockResolvedValue({ items: [bot, forwarded], hasMore: true, pageToken: "next" });
    const converter = new FeishuMessageConverter({ appId: "app", provider: host, downloadResources: false });
    const input = message("input");
    const inputEvent = event(input);
    inputEvent.message.parent_id = "parent";
    const converted = await converter.convert(inputEvent);
    expect(converted.parentMessage?.bodyMarkdown).toContain("[Design]");
    expect(converted.metadata).toMatchObject({ messageId: "input", chatId: "chat", senderId: "user", senderName: "Alice" });
    const api = await converter.convertApiMessage(rich);
    expect(api.bodyMarkdown).toContain("Design");
    expect(api.bodyMarkdown).toContain("Bob");
    const history = await converter.fetchChatHistory("chat", { pageSize: 100, pageToken: "old", startTime: 1, endTime: 2 });
    expect(history).toMatchObject({ hasMore: true, nextPageToken: "next" });
    expect(history.messages[0].metadata.senderName).toBe("Helper");
    expect(history.messages[1].metadata.senderName).toBe("Member");
    expect(host.listChatMessages).toHaveBeenCalledWith("chat", { pageSize: 50, pageToken: "old", startTime: 1, endTime: 2 });
    expect(host.getChatMemberNames).toHaveBeenCalledWith("chat");
    expect(host.getChatInfo).toHaveBeenCalledWith("shared");
    expect(host.getUserInfo).toHaveBeenCalledWith("person");
    expect(host.getDocMeta).toHaveBeenCalledWith("doc_token", "docx");
    expect(fetch).not.toHaveBeenCalled();
    expect(mkdirSync).not.toHaveBeenCalled();
    expect(mkdir).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it("isolates concurrent providers and bounds cycles and denied queries", async () => {
    const first = provider("First");
    const second = provider("Second");
    const cyclic = message("parent");
    cyclic.parent_id = "input";
    vi.mocked(first.getMessage).mockResolvedValue(cyclic);
    vi.mocked(second.getMessage).mockRejectedValue(new Error("Permission denied"));
    vi.mocked(second.getUserInfo).mockRejectedValue(new Error("Permission denied"));
    const input = message("input");
    input.parent_id = "parent";
    const [left, right] = await Promise.all([first, second].map((host) =>
      new FeishuMessageConverter({ appId: "app", provider: host, downloadResources: false }).convertApiMessage(input),
    ));
    expect(left.metadata.senderName).toBe("First");
    expect(left.parentMessage?.parentMessage).toBeUndefined();
    expect(right.metadata.senderName).toBe("未知用户");
    expect(right.bodyMarkdown).toContain("parent_id: parent");
    expect(first.getMessage).toHaveBeenCalledTimes(1);
    expect(second.getMessage).toHaveBeenCalledTimes(1);
    expect(left.metadata.parentId).toBe("parent");
  });
});
