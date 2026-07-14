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

// Non-AI adapters (ical, rss, schema-org, template-scraper) have no way to
// report a category — the source data just doesn't carry one. Rather than
// bucket everything as "sonstiges", infer from title/description keywords.
// This is a heuristic, not a classifier: it only catches strong, common
// German signal words, and unmatched text still falls back to "sonstiges".
const CATEGORY_KEYWORDS: Array<[Category, RegExp]> = [
  ["weinfest", /wein(fest|probe|tage|berg)|winzer/i],
  ["dorffest", /dorffest|stadtfest|sommerfest|herbstfest|fr[uü]hlingsfest|str[aä]ßenfest/i],
  ["vereins-sportfest", /sportfest|turnier|sch[uü]tzenfest/i],
  ["konzert", /konzert|musical/i],
  ["markt", /\bmarkt\b|weihnachtsmarkt|flohmarkt|adventsmarkt/i],
];

function inferCategory(text: string): Category {
  for (const [category, pattern] of CATEGORY_KEYWORDS) {
    if (pattern.test(text)) return category;
  }
  return "sonstiges";
}

export function normalizeCategory(raw: string | undefined, inferFrom?: string): Category {
  if (raw && (CATEGORIES as readonly string[]).includes(raw)) {
    return raw as Category;
  }
  if (inferFrom) {
    return inferCategory(inferFrom);
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
