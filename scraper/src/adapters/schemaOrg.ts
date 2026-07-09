import * as cheerio from "cheerio";
import type { RawEvent } from "../types";
import type { EventAdapter } from "./registry";

interface SchemaOrgEvent {
  "@type"?: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  url?: string;
  location?: { name?: string; address?: string };
}

function isEvent(node: unknown): node is SchemaOrgEvent {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as SchemaOrgEvent)["@type"] === "Event"
  );
}

export const schemaOrgAdapter: EventAdapter = {
  type: "schema-org",

  async fetchEvents(source, fetchText) {
    const html = await fetchText(source.url);
    const $ = cheerio.load(html);
    const events: RawEvent[] = [];

    $('script[type="application/ld+json"]').each((_, el) => {
      const raw = $(el).contents().text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }

      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const candidate of candidates) {
        if (!isEvent(candidate) || !candidate.name || !candidate.startDate) continue;

        events.push({
          title: candidate.name,
          description: candidate.description || undefined,
          start: new Date(candidate.startDate).toISOString(),
          end: candidate.endDate ? new Date(candidate.endDate).toISOString() : undefined,
          location: candidate.location
            ? { name: candidate.location.name, address: candidate.location.address }
            : undefined,
          sourceUrl: candidate.url || source.url,
        });
      }
    });

    return events;
  },
};
