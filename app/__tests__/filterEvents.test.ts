import { filterEvents } from "../src/lib/filterEvents";
import type { EventRecord } from "../src/lib/types";

function makeEvent(overrides: Partial<EventRecord>): EventRecord {
  return {
    id: "1",
    title: "Test Event",
    start: "2026-08-15T18:00:00.000Z",
    location: {},
    category: "sonstiges",
    sourceIds: ["a"],
    sourceUrl: "https://example.test/1",
    region: "test-region",
    lastSeenAt: "2026-07-09T00:00:00.000Z",
    ...overrides,
  };
}

describe("filterEvents", () => {
  it("returns all events when no filters are set", () => {
    const events = [makeEvent({ id: "1" }), makeEvent({ id: "2" })];
    expect(filterEvents(events, {})).toHaveLength(2);
  });

  it("filters out events outside the given radius", () => {
    const near = makeEvent({ id: "near", location: { lat: 48.03, lon: 7.65 } });
    const far = makeEvent({ id: "far", location: { lat: 52.52, lon: 13.405 } }); // Berlin

    const result = filterEvents([near, far], {
      origin: { lat: 48.0301, lon: 7.6501 },
      radiusMeters: 5000,
    });

    expect(result.map((e) => e.id)).toEqual(["near"]);
  });

  it("excludes events without coordinates when a radius filter is active", () => {
    const noCoords = makeEvent({ id: "no-coords", location: { name: "Irgendwo" } });
    const withCoords = makeEvent({ id: "with-coords", location: { lat: 48.03, lon: 7.65 } });

    const result = filterEvents([noCoords, withCoords], {
      origin: { lat: 48.0301, lon: 7.6501 },
      radiusMeters: 5000,
    });

    expect(result.map((e) => e.id)).toEqual(["with-coords"]);
  });

  it("keeps events without coordinates when no radius filter is active", () => {
    const noCoords = makeEvent({ id: "no-coords", location: { name: "Irgendwo" } });
    expect(filterEvents([noCoords], {})).toHaveLength(1);
  });

  it("filters by date range", () => {
    const early = makeEvent({ id: "early", start: "2026-08-01T10:00:00.000Z" });
    const late = makeEvent({ id: "late", start: "2026-09-15T10:00:00.000Z" });

    const result = filterEvents([early, late], {
      dateFrom: "2026-08-10T00:00:00.000Z",
      dateTo: "2026-09-01T00:00:00.000Z",
    });

    expect(result).toHaveLength(0);
  });

  it("includes an event exactly on the dateFrom boundary", () => {
    const event = makeEvent({ id: "boundary", start: "2026-08-15T18:00:00.000Z" });
    const result = filterEvents([event], { dateFrom: "2026-08-15T18:00:00.000Z" });
    expect(result).toHaveLength(1);
  });

  it("returns events sorted chronologically by start date, regardless of input order", () => {
    const late = makeEvent({ id: "late", start: "2026-09-01T10:00:00.000Z" });
    const early = makeEvent({ id: "early", start: "2026-08-01T10:00:00.000Z" });
    const middle = makeEvent({ id: "middle", start: "2026-08-15T10:00:00.000Z" });

    const result = filterEvents([late, early, middle], {});

    expect(result.map((e) => e.id)).toEqual(["early", "middle", "late"]);
  });

  it("filters by category when set", () => {
    const wein = makeEvent({ id: "wein", category: "weinfest" });
    const konzert = makeEvent({ id: "konzert", category: "konzert" });

    const result = filterEvents([wein, konzert], { category: "weinfest" });

    expect(result.map((e) => e.id)).toEqual(["wein"]);
  });

  it("returns all categories when no category filter is set", () => {
    const wein = makeEvent({ id: "wein", category: "weinfest" });
    const konzert = makeEvent({ id: "konzert", category: "konzert" });
    expect(filterEvents([wein, konzert], {})).toHaveLength(2);
  });
});
