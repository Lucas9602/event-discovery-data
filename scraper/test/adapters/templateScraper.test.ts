import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseGermanMonthNameDate, templateScraperAdapter } from "../../src/adapters/templateScraper";
import type { Source } from "../../src/types";

const fixtureHtml = readFileSync(
  path.join(__dirname, "../fixtures/template-scraper.html"),
  "utf-8",
);
const templateConfig = JSON.parse(
  readFileSync(
    path.join(__dirname, "../../config/templates/example-cms.json"),
    "utf-8",
  ),
);

const source: Source = {
  id: "test-template-source",
  name: "Test Template Source",
  url: "https://example.test/veranstaltungen",
  region: "test-region",
  adapterType: "template-scraper",
  adapterConfig: { template: templateConfig },
  legal: { basis: "public", robotsChecked: "2026-07-03" },
  active: true,
};

const trailingTextDateHtml = readFileSync(
  path.join(__dirname, "../fixtures/template-scraper-trailing-text-date.html"),
  "utf-8",
);
const twoDigitYearHtml = readFileSync(
  path.join(__dirname, "../fixtures/template-scraper-two-digit-year.html"),
  "utf-8",
);
const attrDateHtml = readFileSync(
  path.join(__dirname, "../fixtures/template-scraper-attr-date.html"),
  "utf-8",
);
const germanMonthYearHtml = readFileSync(
  path.join(__dirname, "../fixtures/template-scraper-german-month-year.html"),
  "utf-8",
);
const germanMonthNoYearHtml = readFileSync(
  path.join(__dirname, "../fixtures/template-scraper-german-month-no-year.html"),
  "utf-8",
);
const titleSeparatorHtml = readFileSync(
  path.join(__dirname, "../fixtures/template-scraper-title-separator.html"),
  "utf-8",
);

describe("templateScraperAdapter", () => {
  it("extracts events using the CSS selectors from adapterConfig.template", async () => {
    const events = await templateScraperAdapter.fetchEvents(source, async () => fixtureHtml);
    expect(events).toHaveLength(2);

    const [first] = events;
    expect(first.title).toBe("Winzerfest Testhausen");
    expect(first.description).toBe("Weinprobe und Livemusik.");
    expect(first.location?.name).toBe("Winzergenossenschaft");
    expect(first.start).toBe(new Date(2026, 7, 15).toISOString());
    expect(first.sourceUrl).toBe("https://example.test/veranstaltungen/winzerfest");
  });

  it("falls back to the source URL when no link is present", async () => {
    const events = await templateScraperAdapter.fetchEvents(source, async () => fixtureHtml);
    expect(events[1].sourceUrl).toBe(source.url);
    expect(events[1].description).toBeUndefined();
  });

  it("throws a clear error when adapterConfig.template is missing", async () => {
    const badSource = { ...source, adapterConfig: {} };
    await expect(
      templateScraperAdapter.fetchEvents(badSource, async () => fixtureHtml),
    ).rejects.toThrow("template-scraper requires adapterConfig.template");
  });

  it("extracts a DD.MM.YYYY date even with trailing text in the same element", async () => {
    const template = {
      itemSelector: ".item",
      titleSelector: ".headline a",
      dateSelector: ".date",
      dateFormat: "DD.MM.YYYY",
      descriptionSelector: ".text",
      linkSelector: ".headline a",
      linkAttr: "href",
    };
    const trailingTextSource: Source = {
      ...source,
      url: "https://example.test/veranstaltungen",
      adapterConfig: { template },
    };
    const events = await templateScraperAdapter.fetchEvents(
      trailingTextSource,
      async () => trailingTextDateHtml,
    );
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Wanderung im Kaiserstuhl");
    expect(events[0].start).toBe(new Date(2026, 6, 15).toISOString());
  });

  it("extracts a DD.MM.YY date with a weekday prefix, expanding the year to 20XX", async () => {
    const template = {
      itemSelector: ".cVeka_box_eventDate",
      titleSelector: ".cVeka_box_title a",
      dateSelector: ".cVeka_box_date",
      dateFormat: "DD.MM.YY",
      descriptionSelector: ".cVeka_box_teaser",
      locationSelector: ".cVeka_box_location",
      linkSelector: ".cVeka_box_title a",
      linkAttr: "href",
    };
    const twoDigitYearSource: Source = {
      ...source,
      url: "https://example.test/veranstaltungen",
      adapterConfig: { template },
    };
    const events = await templateScraperAdapter.fetchEvents(
      twoDigitYearSource,
      async () => twoDigitYearHtml,
    );
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Offener Nordic Walking Treff");
    expect(events[0].start).toBe(new Date(2026, 6, 15).toISOString());
  });

  it("extracts an ISO date from an attribute when dateAttr is configured", async () => {
    const template = {
      itemSelector: ".tb-event-list-item",
      titleSelector: ".tb-event-list-item__title",
      dateSelector: ".tb-event-list-item__date",
      dateFormat: "ISO",
      dateAttr: "content",
      locationSelector: ".tb-event-list-item__subtitle",
      linkSelector: ".tb-event-list-item__link",
      linkAttr: "href",
    };
    const attrDateSource: Source = {
      ...source,
      url: "https://example.test/veranstaltungen",
      adapterConfig: { template },
    };
    const events = await templateScraperAdapter.fetchEvents(
      attrDateSource,
      async () => attrDateHtml,
    );
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Stadtfuehrung Breisach");
    expect(events[0].start).toBe(new Date("2026-07-15").toISOString());
  });

  it("extracts a full German month name date (DD. MMMM YYYY) with a weekday prefix", async () => {
    const template = {
      itemSelector: ".v_item",
      titleSelector: ".v_titel",
      dateSelector: ".v_datum",
      dateFormat: "DD. MMMM YYYY",
      descriptionSelector: ".v_content",
    };
    const source: Source = {
      id: "test-template-source",
      name: "Test Template Source",
      url: "https://example.test/veranstaltungen",
      region: "test-region",
      adapterType: "template-scraper",
      adapterConfig: { template },
      legal: { basis: "public", robotsChecked: "2026-07-03" },
      active: true,
    };
    const events = await templateScraperAdapter.fetchEvents(source, async () => germanMonthYearHtml);
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Bücherwürmer (für Kindergartenkinder ab 3 Jahren)");
    expect(events[0].start).toBe(new Date(2026, 6, 23).toISOString());
  });

  it("extracts an abbreviated German month name date (DD. MMM) with no year, entities decoded", async () => {
    const template = {
      itemSelector: "tr",
      titleSelector: "td:nth-child(2)",
      dateSelector: "td:nth-child(1)",
      dateFormat: "DD. MMM",
      locationSelector: "td:nth-child(3)",
      linkSelector: "td:nth-child(2) a",
      linkAttr: "href",
    };
    const source: Source = {
      id: "test-template-source",
      name: "Test Template Source",
      url: "https://example.test/veranstaltung.php",
      region: "test-region",
      adapterType: "template-scraper",
      adapterConfig: { template },
      legal: { basis: "public", robotsChecked: "2026-07-03" },
      active: true,
    };
    const events = await templateScraperAdapter.fetchEvents(source, async () => germanMonthNoYearHtml);
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("24.Gottenheimer Weinfest");
    expect(events[0].location?.name).toBe("Rund ums Rathaus");
    expect(events[0].sourceUrl).toBe("https://example.test/Weinfest/");
  });

  it("splits the title on titleSeparator when title/date/location share one text node", async () => {
    const template = {
      itemSelector: ".events-list > div.flex.relative.flex-col",
      titleSelector: ".font-semibold.text-primaryBlue",
      titleSeparator: "|",
      dateSelector: ".font-semibold.text-primaryBlue",
      dateFormat: "DD.MM.YYYY",
      descriptionSelector: ".sib-details-text",
      linkSelector: "a",
      linkAttr: "href",
    };
    const source: Source = {
      id: "test-template-source",
      name: "Test Template Source",
      url: "https://karoevents.de/event",
      region: "test-region",
      adapterType: "template-scraper",
      adapterConfig: { template },
      legal: { basis: "public", robotsChecked: "2026-07-20" },
      active: true,
    };
    const events = await templateScraperAdapter.fetchEvents(source, async () => titleSeparatorHtml);
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("NENA – I EM MUSIC! 2026");
    expect(events[0].start).toBe(new Date(2026, 6, 23).toISOString());
    expect(events[0].sourceUrl).toBe("https://karoevents.de/event/nena-i-em-music-2026/");
  });
});

describe("parseGermanMonthNameDate", () => {
  it("keeps the current year when the date has not passed yet relative to referenceDate", () => {
    const referenceDate = new Date(2026, 6, 1); // 1. Juli 2026
    const iso = parseGermanMonthNameDate("Di 21. Jul. 16:00", false, referenceDate);
    expect(iso).toBe(new Date(2026, 6, 21).toISOString());
  });

  it("rolls over to next year when the date has already passed relative to referenceDate", () => {
    const referenceDate = new Date(2026, 11, 1); // 1. Dezember 2026
    const iso = parseGermanMonthNameDate("Di 21. Jul. 16:00", false, referenceDate);
    expect(iso).toBe(new Date(2027, 6, 21).toISOString());
  });

  it("throws a clear error when the text does not contain a recognizable German date", () => {
    expect(() => parseGermanMonthNameDate("kein Datum hier", true)).toThrow(
      'Cannot parse date "kein Datum hier" with format DD. MMMM YYYY',
    );
  });
});
