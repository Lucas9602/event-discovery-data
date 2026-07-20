import { eventsWithCoords } from "../src/lib/mapMarkers";
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

describe("eventsWithCoords", () => {
  it("keeps an event with both lat and lon", () => {
    const event = makeEvent({ id: "has-coords", location: { lat: 48.03, lon: 7.65 } });
    expect(eventsWithCoords([event])).toEqual([event]);
  });

  it("drops an event with neither lat nor lon", () => {
    const event = makeEvent({ id: "no-coords", location: { name: "Irgendwo" } });
    expect(eventsWithCoords([event])).toEqual([]);
  });

  it("drops an event with only lat set", () => {
    const event = makeEvent({ id: "lat-only", location: { lat: 48.03 } });
    expect(eventsWithCoords([event])).toEqual([]);
  });

  it("drops an event with only lon set", () => {
    const event = makeEvent({ id: "lon-only", location: { lon: 7.65 } });
    expect(eventsWithCoords([event])).toEqual([]);
  });

  it("filters a mixed list down to only the events with full coordinates", () => {
    const withCoords = makeEvent({ id: "with-coords", location: { lat: 48.03, lon: 7.65 } });
    const withoutCoords = makeEvent({ id: "without-coords", location: {} });
    expect(eventsWithCoords([withCoords, withoutCoords])).toEqual([withCoords]);
  });
});
