import { describe, expect, it } from "vitest";

import type { Mention } from "../../src/types.js";
import { replaceMentions } from "../../src/utils/mention.js";

describe("replaceMentions", () => {
  it("replaces known mentions with name and open id", () => {
    const mentions: Mention[] = [
      {
        key: "@_user_1",
        id: {
          union_id: "on_1",
          user_id: "u_1",
          open_id: "ou_1",
        },
        name: "李四",
        tenant_key: "tenant",
      },
      {
        key: "@_user_2",
        id: {
          union_id: "on_2",
          user_id: "u_2",
          open_id: "ou_2",
        },
        name: "王五",
        tenant_key: "tenant",
      },
    ];

    expect(
      replaceMentions("找 @_user_1 看下，抄送 @_user_2", mentions),
    ).toBe("找 @李四(ou_1) 看下，抄送 @王五(ou_2)");
  });

  it("keeps unmatched placeholders and replaces @_all", () => {
    expect(replaceMentions("通知 @_user_3 和 @_all", [])).toBe(
      "通知 @_user_3 和 @所有人",
    );
  });

  it("replaces longer placeholders before shorter placeholders", () => {
    const mentions: Mention[] = [
      {
        key: "@_user_1",
        id: {
          union_id: "on_1",
          user_id: "u_1",
          open_id: "ou_1",
        },
        name: "李四",
        tenant_key: "tenant",
      },
      {
        key: "@_user_10",
        id: {
          union_id: "on_10",
          user_id: "u_10",
          open_id: "ou_10",
        },
        name: "王五",
        tenant_key: "tenant",
      },
    ];

    expect(replaceMentions("找 @_user_10 处理，抄送 @_user_1", mentions)).toBe(
      "找 @王五(ou_10) 处理，抄送 @李四(ou_1)",
    );
  });
});
