function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatTimestamp(ms: string): string {
  const timestamp = Number(ms);

  if (!Number.isFinite(timestamp)) {
    return "";
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
  ].join("-") +
    ` ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}
