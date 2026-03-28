import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable, Transform } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";

import type {
  Attachment,
  FeishuApiClient,
  FeishuApiMessage,
} from "./types.js";

const FEISHU_API_BASE_URL = "https://open.feishu.cn/open-apis";
const TOKEN_REFRESH_BUFFER_MS = 60_000;

type FeishuApiEnvelope<T> = {
  code: number;
  msg: string;
  data: T;
};

type TenantAccessTokenResponse = {
  code: number;
  msg: string;
  tenant_access_token?: string;
  expire?: number;
};

type ResourceType = Attachment["type"];

type RequestOptions = RequestInit & {
  skipAuth?: boolean;
};

export class FeishuApiClientImpl implements FeishuApiClient {
  private tenantAccessToken: string | null = null;
  private tokenExpiresAt = 0;
  private tokenRefreshPromise: Promise<string> | null = null;
  private readonly userCache = new Map<string, { name: string }>();
  private readonly chatCache = new Map<string, { name: string }>();

  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
  ) {}

  async getTenantAccessToken(): Promise<string> {
    if (this.hasValidTenantAccessToken()) {
      return this.tenantAccessToken as string;
    }

    if (this.tokenRefreshPromise) {
      return this.tokenRefreshPromise;
    }

    this.tokenRefreshPromise = this.refreshTenantAccessToken().finally(() => {
      this.tokenRefreshPromise = null;
    });

    return this.tokenRefreshPromise;
  }

  async getUserInfo(openId: string): Promise<{ name: string }> {
    const cached = this.userCache.get(openId);

    if (cached) {
      return cached;
    }

    const data = await this.request<{ user?: { name?: string } }>(
      `/contact/v3/users/${encodeURIComponent(openId)}?user_id_type=open_id`,
    );
    const user = {
      name: this.requireString(
        data.user?.name,
        `Missing user name for open_id ${openId}`,
      ),
    };

    this.userCache.set(openId, user);

    return user;
  }

  async getChatInfo(chatId: string): Promise<{ name: string }> {
    const cached = this.chatCache.get(chatId);

    if (cached) {
      return cached;
    }

    const data = await this.request<{ chat?: { name?: string }; name?: string }>(
      `/im/v1/chats/${encodeURIComponent(chatId)}`,
    );
    const chat = {
      name: this.requireString(
        data.chat?.name ?? data.name,
        `Missing chat name for chat_id ${chatId}`,
      ),
    };

    this.chatCache.set(chatId, chat);

    return chat;
  }

  async getMessage(messageId: string): Promise<FeishuApiMessage> {
    const data = await this.request<{ items?: FeishuApiMessage[] }>(
      `/im/v1/messages/${encodeURIComponent(messageId)}`,
    );
    const message =
      data.items?.find((item) => item.message_id === messageId) ?? data.items?.[0];

    if (!message) {
      throw new Error(`Feishu message ${messageId} not found`);
    }

    return message;
  }

  async getMergeForwardMessages(messageId: string): Promise<FeishuApiMessage[]> {
    const data = await this.request<{ items?: FeishuApiMessage[] }>(
      `/im/v1/messages/${encodeURIComponent(messageId)}`,
    );

    return (data.items ?? []).filter((item) => item.message_id !== messageId);
  }

  async downloadResource(
    messageId: string,
    fileKey: string,
    type: ResourceType,
    savePath: string,
    maxSize?: number,
  ): Promise<void> {
    const token = await this.getTenantAccessToken();
    const resourceType = type === "image" ? "image" : "file";
    const url =
      `${FEISHU_API_BASE_URL}/im/v1/messages/${encodeURIComponent(messageId)}` +
      `/resources/${encodeURIComponent(fileKey)}?type=${resourceType}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Feishu API request failed: ${response.status} ${response.statusText}`,
      );
    }

    if (!response.body) {
      throw new Error("Feishu resource download response body is empty");
    }

    await mkdir(dirname(savePath), { recursive: true });

    let downloadedBytes = 0;
    const sizeGuard = new Transform({
      transform(chunk, _encoding, callback) {
        downloadedBytes += Buffer.byteLength(chunk);

        if (typeof maxSize === "number" && downloadedBytes > maxSize) {
          callback(
            new Error(`Feishu resource exceeds max size limit: ${maxSize} bytes`),
          );
          return;
        }

        callback(null, chunk);
      },
    });

    try {
      await pipeline(
        Readable.fromWeb(response.body as unknown as NodeReadableStream),
        sizeGuard,
        createWriteStream(savePath),
      );
    } catch (error) {
      await rm(savePath, { force: true });
      throw error;
    }
  }

  async getDocMeta(docToken: string, docType: string): Promise<{ title: string }> {
    switch (docType) {
      case "docx":
        return this.getDocxMeta(docToken);
      case "docs":
        return this.getWikiNodeMeta(docToken, "doc");
      case "sheets":
        return this.getSpreadsheetMeta(docToken);
      case "wiki":
        return this.getWikiNodeMeta(docToken);
      case "base":
      case "bitable":
        return this.getBitableMeta(docToken);
      case "slides":
        return this.getWikiNodeMeta(docToken, "slides");
      case "mindnotes":
        return this.getWikiNodeMeta(docToken, "mindnote");
      default:
        throw new Error(`Unsupported Feishu doc type: ${docType}`);
    }
  }

  private hasValidTenantAccessToken(): boolean {
    return (
      this.tenantAccessToken !== null &&
      Date.now() < this.tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS
    );
  }

  private async refreshTenantAccessToken(): Promise<string> {
    const payload = await this.fetchJson<TenantAccessTokenResponse>(
      `${FEISHU_API_BASE_URL}/auth/v3/tenant_access_token/internal`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          app_id: this.appId,
          app_secret: this.appSecret,
        }),
        skipAuth: true,
      },
    );

    if (payload.code !== 0) {
      throw new Error(
        `Feishu token request failed: ${payload.code} ${payload.msg}`,
      );
    }

    const token = this.requireString(
      payload.tenant_access_token,
      "Missing tenant access token in Feishu response",
    );
    const expire = payload.expire;

    if (typeof expire !== "number" || expire <= 0) {
      throw new Error("Invalid tenant access token expiry in Feishu response");
    }

    this.tenantAccessToken = token;
    this.tokenExpiresAt = Date.now() + expire * 1000;

    return token;
  }

  private async getDocxMeta(docToken: string): Promise<{ title: string }> {
    try {
      const data = await this.request<{ document?: { title?: string } }>(
        `/docx/v1/documents/${encodeURIComponent(docToken)}`,
      );

      return {
        title: this.requireString(
          data.document?.title,
          `Missing docx title for token ${docToken}`,
        ),
      };
    } catch {
      return this.getWikiNodeMeta(docToken, "docx");
    }
  }

  private async getSpreadsheetMeta(docToken: string): Promise<{ title: string }> {
    try {
      const data = await this.request<{ spreadsheet?: { title?: string } }>(
        `/sheets/v3/spreadsheets/${encodeURIComponent(docToken)}`,
      );

      return {
        title: this.requireString(
          data.spreadsheet?.title,
          `Missing spreadsheet title for token ${docToken}`,
        ),
      };
    } catch {
      return this.getWikiNodeMeta(docToken, "sheet");
    }
  }

  private async getBitableMeta(docToken: string): Promise<{ title: string }> {
    try {
      const data = await this.request<{ app?: { name?: string } }>(
        `/bitable/v1/apps/${encodeURIComponent(docToken)}`,
      );

      return {
        title: this.requireString(
          data.app?.name,
          `Missing bitable title for token ${docToken}`,
        ),
      };
    } catch {
      return this.getWikiNodeMeta(docToken, "bitable");
    }
  }

  private async getWikiNodeMeta(
    docToken: string,
    objType?: string,
  ): Promise<{ title: string }> {
    const searchParams = new URLSearchParams({ token: docToken });

    if (objType) {
      searchParams.set("obj_type", objType);
    }

    const data = await this.request<{ node?: { title?: string } }>(
      `/wiki/v2/spaces/get_node?${searchParams.toString()}`,
    );

    return {
      title: this.requireString(
        data.node?.title,
        `Missing wiki title for token ${docToken}`,
      ),
    };
  }

  private async request<T>(path: string, options?: RequestOptions): Promise<T> {
    const payload = await this.fetchJson<FeishuApiEnvelope<T>>(
      `${FEISHU_API_BASE_URL}${path}`,
      options,
    );

    if (payload.code !== 0) {
      throw new Error(`Feishu API request failed: ${payload.code} ${payload.msg}`);
    }

    return payload.data;
  }

  private async fetchJson<T>(url: string, options?: RequestOptions): Promise<T> {
    const headers = new Headers(options?.headers);

    if (!options?.skipAuth) {
      headers.set("Authorization", `Bearer ${await this.getTenantAccessToken()}`);
    }

    if (options?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json; charset=utf-8");
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(
        `Feishu API request failed: ${response.status} ${response.statusText}`,
      );
    }

    return (await response.json()) as T;
  }

  private requireString(value: unknown, errorMessage: string): string {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(errorMessage);
    }

    return value;
  }
}
