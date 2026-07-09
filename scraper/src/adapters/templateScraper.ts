import * as cheerio from "cheerio";
import type { RawEvent } from "../types";
import type { EventAdapter } from "./registry";

interface TemplateConfig {
  itemSelector: string;
  titleSelector: string;
  dateSelector: string;
  dateFormat: "DD.MM.YYYY";
  descriptionSelector?: string;
  locationSelector?: string;
  linkSelector?: string;
  linkAttr?: string;
}

function parseGermanDate(text: string): string {
  const match = text.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) {
    throw new Error(`Cannot parse date "${text}" with format DD.MM.YYYY`);
  }
  const [, day, month, year] = match;
  return new Date(Number(year), Number(month) - 1, Number(day)).toISOString();
}

function resolveUrl(base: string, href: string): string {
  return new URL(href, base).toString();
}

export const templateScraperAdapter: EventAdapter = {
  type: "template-scraper",

  async fetchEvents(source, fetchText) {
    const template = source.adapterConfig.template as TemplateConfig | undefined;
    if (!template) {
      throw new Error("template-scraper requires adapterConfig.template");
    }

    const html = await fetchText(source.url);
    const $ = cheerio.load(html);
    const events: RawEvent[] = [];

    $(template.itemSelector).each((_, el) => {
      const item = $(el);
      const title = item.find(template.titleSelector).first().text().trim();
      const dateText = item.find(template.dateSelector).first().text().trim();
      if (!title || !dateText) return;

      const description = template.descriptionSelector
        ? item.find(template.descriptionSelector).first().text().trim() || undefined
        : undefined;
      const locationName = template.locationSelector
        ? item.find(template.locationSelector).first().text().trim() || undefined
        : undefined;

      let sourceUrl = source.url;
      if (template.linkSelector) {
        const href = item.find(template.linkSelector).first().attr(template.linkAttr ?? "href");
        if (href) sourceUrl = resolveUrl(source.url, href);
      }

      events.push({
        title,
        description,
        start: parseGermanDate(dateText),
        location: locationName ? { name: locationName } : undefined,
        sourceUrl,
      });
    });

    return events;
  },
};
