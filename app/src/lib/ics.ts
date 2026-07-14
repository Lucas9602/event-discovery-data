import type { EventRecord } from "./types";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function toIcsDate(iso: string): string {
  const d = new Date(iso);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n");
}

export function buildIcsContent(event: EventRecord): string {
  const start = new Date(event.start);
  const end = event.end ? new Date(event.end) : new Date(start.getTime() + 2 * 3600 * 1000);
  const now = new Date();
  const location = event.location.name ?? event.location.address ?? "";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//event-discovery-app//DE",
    "BEGIN:VEVENT",
    `UID:${event.id}@event-discovery-app`,
    `DTSTAMP:${toIcsDate(now.toISOString())}`,
    `DTSTART:${toIcsDate(start.toISOString())}`,
    `DTEND:${toIcsDate(end.toISOString())}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `DESCRIPTION:${escapeIcsText(event.description ?? "")}`,
    `URL:${event.sourceUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join("\r\n");
}
