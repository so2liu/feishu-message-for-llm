export function parseJsonSafely(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  return parseJsonSafely(value);
}

export function parseJsonRecord(
  value: unknown,
): Record<string, unknown> | null {
  const parsed = parseJsonValue(value);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  return parsed as Record<string, unknown>;
}
