import { createHash } from "node:crypto";
import { CATEGORIES, type Category, type RawEvent } from "./types";

const UMLAUT_MAP: Record<string, string> = {
  ä: "a",
  ö: "o",
  ü: "u",
  ß: "ss",
};

const HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&uuml;": "ü",
  "&ouml;": "ö",
  "&auml;": "ä",
  "&Uuml;": "Ü",
  "&Ouml;": "Ö",
  "&Auml;": "Ä",
  "&szlig;": "ß",
};

function decodeHtmlEntities(text: string): string {
  let result = text;
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    result = result.split(entity).join(char);
  }
  return result;
}

// Source CMS description fields carry two artifacts of their own display
// width: single newlines mid-paragraph (a wrap, not a real line break) and
// runs of extra spaces where words got reflowed. Genuine paragraph breaks
// (\n\n) must survive; everything else collapses to single spaces.
export function cleanDescription(text: string): string {
  const decoded = decodeHtmlEntities(text);
  const paragraphMarker = "\x00";
  const withParagraphsMarked = decoded.replace(/\n{2,}/g, paragraphMarker);
  const unwrapped = withParagraphsMarked.replace(/\n/g, " ");
  const collapsedSpaces = unwrapped.replace(/[ \t]+/g, " ");
  const restored = collapsedSpaces.replace(new RegExp(paragraphMarker, "g"), "\n\n");
  return restored.trim();
}

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
// "fuehrung-tour" is checked before "weinfest": a winery tour/tasting like
// "Kellerführung bei den Winzern" contains "Winzern", which would otherwise
// match weinfest's /winzer/i first and shadow the more specific tour signal.
const CATEGORY_KEYWORDS: Array<[Category, RegExp]> = [
  ["fuehrung-tour", /f[uü]hrung|wanderung|rundgang|\btour\b/i],
  ["weinfest", /wein(fest|probe|tage|berg)|winzer/i],
  ["dorffest", /dorffest|stadtfest|sommerfest|herbstfest|fr[uü]hlingsfest|str[aä]ßenfest/i],
  ["konzert", /konzert|musical/i],
  ["markt", /\bmarkt\b|weihnachtsmarkt|flohmarkt|adventsmarkt/i],
  ["geselligkeit", /caf[eé]|\btreff\b|stammtisch/i],
  ["kultur", /ausstellung|vortrag/i],
  ["vereinsleben", /jubil[aä]um|vereinsfeier|sportfest|turnier|sch[uü]tzenfest/i],
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
