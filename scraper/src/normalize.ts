import { createHash } from "node:crypto";
import { CATEGORIES, type Category, type RawEvent } from "./types";

const UMLAUT_MAP: Record<string, string> = {
  ä: "a",
  ö: "o",
  ü: "u",
  ß: "ss",
};

export function normalizeTitle(title: string): string {
  const lower = title.toLowerCase();
  const deUmlauted = lower.replace(/[äöüß]/g, (ch) => UMLAUT_MAP[ch] ?? ch);
  const withoutPunctuation = deUmlauted.replace(/[^a-z0-9\s]/g, " ");
  return withoutPunctuation.replace(/\s+/g, " ").trim();
}

export function dedupKey(title: string, isoDate: string): string {
  const dateOnly = isoDate.slice(0, 10);
  return `${normalizeTitle(title)}|${dateOnly}`;
}

export function normalizeCategory(raw: string | undefined): Category {
  if (raw && (CATEGORIES as readonly string[]).includes(raw)) {
    return raw as Category;
  }
  return "sonstiges";
}

export function computeEventId(rawEvent: RawEvent, region: string): string {
  const key = [
    region,
    normalizeTitle(rawEvent.title),
    rawEvent.start.slice(0, 10),
    rawEvent.location?.name ? normalizeTitle(rawEvent.location.name) : "",
  ].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}
