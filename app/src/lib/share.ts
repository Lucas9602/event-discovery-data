import type { EventRecord } from "./types";

export function buildShareMessage(event: EventRecord): string {
  const start = new Date(event.start);
  const date = start.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const time = start.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const location = event.location.name ?? "?";
  return `${event.title} — ${date}, ${time} in ${location}\n${event.sourceUrl}`;
}
