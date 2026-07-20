import * as cheerio from "cheerio";
import type { RawEvent } from "../types";
import type { EventAdapter } from "./registry";

interface TemplateConfig {
  itemSelector: string;
  titleSelector: string;
  titleSeparator?: string;
  dateSelector: string;
  dateFormat: "DD.MM.YYYY" | "DD.MM.YY" | "ISO" | "DD. MMMM YYYY" | "DD. MMM";
  dateAttr?: string;
  descriptionSelector?: string;
  locationSelector?: string;
  linkSelector?: string;
  linkAttr?: string;
}

// Some CMS templates spell the month out in German instead of using digits
// (a full name like "Juli" or an abbreviation like "Jul."). Both forms are
// looked up via the same lowercased, trailing-dot-stripped key.
const GERMAN_MONTHS: Record<string, number> = {
  jan: 0, januar: 0,
  feb: 1, februar: 1,
  mär: 2, maer: 2, märz: 2, maerz: 2, mrz: 2,
  apr: 3, april: 3,
  mai: 4,
  jun: 5, juni: 5,
  jul: 6, juli: 6,
  aug: 7, august: 7,
  sep: 8, september: 8,
  okt: 9, oktober: 9,
  nov: 10, november: 10,
  dez: 11, dezember: 11,
};

function monthIndexFromGermanName(name: string): number {
  const key = name.toLowerCase().replace(/\.$/, "");
  const month = GERMAN_MONTHS[key];
  if (month === undefined) {
    throw new Error(`Unknown German month name "${name}"`);
  }
  return month;
}

// hasYear=false is for CMS templates that omit the year entirely (e.g. a
// municipal events table showing only "Di 21. Jul. 16:00"). In that case we
// infer the year from referenceDate: if the day/month has already passed
// this year, it must mean next year's occurrence.
export function parseGermanMonthNameDate(
  text: string,
  hasYear: boolean,
  referenceDate: Date = new Date(),
): string {
  const pattern = hasYear
    ? /(\d{1,2})\.\s*([A-ZÄÖÜ][a-zäöüß]+)\.?\s*(\d{4})/
    : /(\d{1,2})\.\s*([A-ZÄÖÜ][a-zäöüß]+)\.?/;
  const match = text.match(pattern);
  if (!match) {
    throw new Error(`Cannot parse date "${text}" with format DD. MMMM${hasYear ? " YYYY" : ""}`);
  }
  const [, dayText, monthName, yearText] = match;
  const day = Number(dayText);
  const month = monthIndexFromGermanName(monthName);
  let year = yearText ? Number(yearText) : referenceDate.getFullYear();
  if (!yearText) {
    const candidate = new Date(year, month, day);
    const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
    if (candidate < today) year += 1;
  }
  return new Date(year, month, day).toISOString();
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
  if (template.dateFormat === "DD. MMMM YYYY") {
    return parseGermanMonthNameDate(text, true);
  }
  if (template.dateFormat === "DD. MMM") {
    return parseGermanMonthNameDate(text, false);
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
      const titleText = item.find(template.titleSelector).first().text();
      const title = (
        template.titleSeparator ? titleText.split(template.titleSeparator)[0] : titleText
      ).trim();
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
