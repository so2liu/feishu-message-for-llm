import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";

import type { Attachment, HandlerContext, ResourceError, ResourceRequest, ResolvedResource } from "../types.js";
import { sanitizeFileName } from "./sanitize.js";
import { isTextFile } from "./text-file.js";

export const MAX_TEXT_FILE_PREVIEW_BYTES = 64 * 1024;

class ResourceResolutionError extends Error {
  constructor(readonly resourceError: ResourceError) {
    super(resourceError.code);
  }
}

export function resourceFailure(error: unknown): { resourceErrors?: ResourceError[] } {
  return error instanceof ResourceResolutionError
    ? { resourceErrors: [error.resourceError] }
    : {};
}

function boundedPreview(preview: ResolvedResource["textPreview"]): ResolvedResource["textPreview"] {
  if (!preview) return undefined;
  const bytes = Buffer.from(preview.content, "utf8");
  return {
    content: bytes.subarray(0, MAX_TEXT_FILE_PREVIEW_BYTES).toString("utf8"),
    truncated: preview.truncated === true || bytes.length > MAX_TEXT_FILE_PREVIEW_BYTES,
  };
}

async function localPreview(filePath: string): Promise<ResolvedResource["textPreview"]> {
  const file = await open(filePath, "r");
  try {
    const bytes = Buffer.alloc(MAX_TEXT_FILE_PREVIEW_BYTES + 1);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    return boundedPreview({ content: bytes.subarray(0, bytesRead).toString("utf8") });
  } finally {
    await file.close();
  }
}

export async function resolveResource(
  context: HandlerContext,
  input: Omit<ResourceRequest, "messageId" | "maxSize">,
  localFileName: string,
): Promise<{ attachment: Attachment; textPreview?: ResolvedResource["textPreview"] }> {
  const request: ResourceRequest = { ...input, messageId: context.messageId, maxSize: context.maxFileSize };
  const fail = (code: ResourceError["code"]) => new ResourceResolutionError({
    messageId: request.messageId, fileKey: request.fileKey, type: request.type, code,
  });
  if (context.downloadResources === false) throw fail("unavailable");
  if (context.resourceResolver) {
    let resource: ResolvedResource;
    try {
      resource = await context.resourceResolver(request);
      if (!resource.resourceRef?.trim()) throw fail("resolve_failed");
      if (resource.size !== undefined && (!Number.isFinite(resource.size) || resource.size < 0)) {
        throw fail("resolve_failed");
      }
    } catch {
      throw fail("resolve_failed");
    }
    if (request.maxSize !== undefined && resource.size !== undefined && resource.size > request.maxSize) {
      throw fail("too_large");
    }
    return {
      attachment: {
        type: input.type, resourceRef: resource.resourceRef,
        messageId: request.messageId, fileKey: request.fileKey,
        ...(resource.fileName ?? input.fileName ? { fileName: resource.fileName ?? input.fileName } : {}),
        ...(resource.mimeType ?? input.mimeType ? { mimeType: resource.mimeType ?? input.mimeType } : {}),
        ...(resource.size !== undefined ? { size: resource.size } : {}),
      },
      textPreview: boundedPreview(resource.textPreview),
    };
  }
  if (!context.apiClient.downloadResource) throw fail("unavailable");
  const directory = join(context.downloadDir, sanitizeFileName(context.messageId));
  const filePath = join(directory, sanitizeFileName(localFileName));
  await mkdir(directory, { recursive: true });
  await context.apiClient.downloadResource(request.messageId, input.fileKey, input.type, filePath, request.maxSize);
  const attachment: Attachment = {
    type: input.type, filePath,
    ...(input.fileName ? { fileName: input.fileName } : {}),
    ...(input.mimeType ? { mimeType: input.mimeType } : {}),
  };
  const textPreview = input.type === "file" && isTextFile(input.fileName ?? localFileName)
    ? await localPreview(filePath).catch(() => undefined)
    : undefined;
  return { attachment, textPreview };
}

export function resourceLink(attachment: Attachment): string {
  return attachment.resourceRef ?? attachment.filePath ?? "";
}
