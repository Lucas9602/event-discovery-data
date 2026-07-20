import type { EventRecord } from "./types";

export function eventsWithCoords(events: EventRecord[]): EventRecord[] {
  return events.filter(
    (event) => typeof event.location.lat === "number" && typeof event.location.lon === "number",
  );
}
