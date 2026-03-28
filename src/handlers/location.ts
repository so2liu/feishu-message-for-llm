import type { HandlerContext, HandlerResult } from "../types.js";
import { parseJsonRecord } from "../utils/json.js";

interface LocationContent {
  name: string;
  longitude: string;
  latitude: string;
}

function stringifyCoordinate(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return "";
}

function parseLocationContent(content: unknown): LocationContent {
  const parsed = parseJsonRecord(content);

  if (!parsed) {
    return {
      name: "",
      longitude: "",
      latitude: "",
    };
  }

  return {
    name: typeof parsed.name === "string" ? parsed.name : "",
    longitude: stringifyCoordinate(parsed.longitude),
    latitude: stringifyCoordinate(parsed.latitude),
  };
}

export async function handleLocation(
  content: unknown,
  _context: HandlerContext,
): Promise<HandlerResult> {
  const { name, longitude, latitude } = parseLocationContent(content);

  return {
    text: `[位置: ${name}, 经度: ${longitude}, 纬度: ${latitude}]`,
    attachments: [],
  };
}
