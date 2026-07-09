import ical from "node-ical";
import type { RawEvent, Source } from "../types";
import type { EventAdapter } from "./registry";

export const icalAdapter: EventAdapter = {
  type: "ical",

  async fetchEvents(source, fetchText) {
    const text = await fetchText(source.url);
    const parsed = ical.sync.parseICS(text);
    const events: RawEvent[] = [];

    for (const component of Object.values(parsed)) {
      if (component.type !== "VEVENT") continue;

      const startDate = new Date(component.start as unknown as string);
      const startIso = startDate.toISOString();

      // When DTEND is not present, node-ical defaults it to start.
      // We should treat this as undefined.
      let endIso: string | undefined = undefined;
      if (component.end) {
        const endDate = new Date(component.end as unknown as string);
        const endIso_candidate = endDate.toISOString();
        // Only set end if it's different from start
        if (endIso_candidate !== startIso) {
          endIso = endIso_candidate;
        }
      }

      events.push({
        title: component.summary ?? "",
        description: component.description || undefined,
        start: startIso,
        end: endIso,
        location: component.location ? { name: component.location } : undefined,
        sourceUrl: (component as { url?: string }).url || source.url,
      });
    }

    return events;
  },
};
