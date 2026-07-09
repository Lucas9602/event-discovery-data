import Parser from "rss-parser";
import type { RawEvent } from "../types";
import type { EventAdapter } from "./registry";

export const rssAdapter: EventAdapter = {
  type: "rss",

  async fetchEvents(source, fetchText) {
    const text = await fetchText(source.url);
    const parser = new Parser();
    const feed = await parser.parseString(text);
    const events: RawEvent[] = [];

    for (const item of feed.items) {
      if (!item.title || !item.pubDate) continue;

      events.push({
        title: item.title,
        description: item.contentSnippet || item.content || undefined,
        start: new Date(item.pubDate).toISOString(),
        sourceUrl: item.link || source.url,
      });
    }

    return events;
  },
};
