import * as cheerio from "cheerio";
import type { RawEvent } from "../types";
import type { EventAdapter } from "./registry";

interface TemplateConfig {
  itemSelector: string;
  titleSelector: string;
  dateSelector: string;
  dateFormat: "DD.MM.YYYY" | "DD.MM.YY" | "ISO";
  dateAttr?: string;
  descriptionSelector?: string;
  locationSelector?: string;
  linkSelector?: string;
  linkAttr?: string;
}

// Some CMS templates wrap the date in extra text (a weekday prefix, a
// trailing time), so we search for the pattern rather than requiring an
// exact match against the whole string.
function parseGermanDate(text: string, format: "DD.MM.YYYY" | "DD.MM.YY"): string {
  const yearPattern = format === "DD.MM.YY" ? "(\\d{2})" : "(\\d{4})";
  const match = text.match(new RegExp(`(\\d{2})\\.(\\d{2})\\.${yearPattern}`));
  if (!match) {
    throw new Error(`Cannot parse date "${text}" with format ${format}`);
  }
  const [, day, month, rawYear] = match;
  const year = format === "DD.MM.YY" ? 2000 + Number(rawYear) : Number(rawYear);
  return new Date(year, Number(month) - 1, Number(day)).toISOString();
}

function parseDate(text: string, template: TemplateConfig): string {
  if (template.dateFormat === "ISO") {
    const date = new Date(text.trim());
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Cannot parse date "${text}" with format ISO`);
    }
    return date.toISOString();
  }
  return parseGermanDate(text, template.dateFormat);
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
      const dateEl = item.find(template.dateSelector).first();
      const dateText = (template.dateAttr ? dateEl.attr(template.dateAttr) : dateEl.text())?.trim();
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
        start: parseDate(dateText, template),
        location: locationName ? { name: locationName } : undefined,
        sourceUrl,
      });
    });

    return events;
  },
};
