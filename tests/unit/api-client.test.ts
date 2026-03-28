import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FeishuApiClientImpl } from "../../src/api-client.js";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
}

describe("FeishuApiClientImpl", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("fetches and caches tenant access token", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        code: 0,
        msg: "ok",
        tenant_access_token: "token-1",
        expire: 7200,
      }),
    );

    const client = new FeishuApiClientImpl("cli_xxx", "secret_xxx");
    const [tokenA, tokenB] = await Promise.all([
      client.getTenantAccessToken(),
      client.getTenantAccessToken(),
    ]);
    const tokenC = await client.getTenantAccessToken();

    expect(tokenA).toBe("token-1");
    expect(tokenB).toBe("token-1");
    expect(tokenC).toBe("token-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("refreshes tenant access token before expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-28T00:00:00.000Z"));

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          msg: "ok",
          tenant_access_token: "token-1",
          expire: 120,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          msg: "ok",
          tenant_access_token: "token-2",
          expire: 120,
        }),
      );

    const client = new FeishuApiClientImpl("cli_xxx", "secret_xxx");

    await expect(client.getTenantAccessToken()).resolves.toBe("token-1");

    vi.setSystemTime(new Date("2026-03-28T00:01:01.000Z"));

    await expect(client.getTenantAccessToken()).resolves.toBe("token-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns cached user info without repeated fetch", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          msg: "ok",
          tenant_access_token: "token-1",
          expire: 7200,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          msg: "success",
          data: {
            user: {
              name: "张三",
            },
          },
        }),
      );

    const client = new FeishuApiClientImpl("cli_xxx", "secret_xxx");

    await expect(client.getUserInfo("ou_123")).resolves.toEqual({ name: "张三" });
    await expect(client.getUserInfo("ou_123")).resolves.toEqual({ name: "张三" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://open.feishu.cn/open-apis/contact/v3/users/ou_123?user_id_type=open_id",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
  });

  it("downloads resource via stream and writes file", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "feishu-api-client-test-"));
    const savePath = join(tempDir, "resource.bin");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("hello "));
        controller.enqueue(new TextEncoder().encode("world"));
        controller.close();
      },
    });

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          code: 0,
          msg: "ok",
          tenant_access_token: "token-1",
          expire: 7200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
        }),
      );

    const client = new FeishuApiClientImpl("cli_xxx", "secret_xxx");

    try {
      await client.downloadResource(
        "om_message",
        "file_key_123",
        "file",
        savePath,
      );

      await expect(readFile(savePath, "utf8")).resolves.toBe("hello world");
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "https://open.feishu.cn/open-apis/im/v1/messages/om_message/resources/file_key_123?type=file",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer token-1",
          }),
        }),
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
