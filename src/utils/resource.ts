import type { FeishuApiClient, HandlerContext } from "../types.js";

export async function downloadLocalResource(
  context: HandlerContext,
  ...args: Parameters<FeishuApiClient["downloadResource"]>
): Promise<void> {
  if (!context.apiClient.downloadResource) {
    throw new Error("Host resource resolver is not configured");
  }
  await context.apiClient.downloadResource(...args);
}
