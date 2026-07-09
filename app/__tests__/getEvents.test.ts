// app/__tests__/getEvents.test.ts
import { getEvents, type EventStorage } from "../src/lib/getEvents";

const SAMPLE_EVENTS = JSON.stringify([
  { id: "1", title: "Weinfest", start: "2026-08-15T18:00:00.000Z", location: {}, category: "weinfest", sourceIds: ["a"], sourceUrl: "https://x.test/1", region: "r", lastSeenAt: "2026-07-09T00:00:00.000Z" },
]);

function makeStorage(initial: Record<string, string> = {}): EventStorage {
  const store = new Map(Object.entries(initial));
  return {
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, value) => {
      store.set(key, value);
    },
  };
}

describe("getEvents", () => {
  it("fetches events and caches them in storage", async () => {
    const fetchText = jest.fn().mockResolvedValue(SAMPLE_EVENTS);
    const storage = makeStorage();

    const events = await getEvents(fetchText, storage, "https://example.test/events.json");

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Weinfest");
    expect(await storage.getItem("events-cache-v1")).toBe(SAMPLE_EVENTS);
  });

  it("falls back to the cached copy when the fetch fails", async () => {
    const fetchText = jest.fn().mockRejectedValue(new Error("offline"));
    const storage = makeStorage({ "events-cache-v1": SAMPLE_EVENTS });

    const events = await getEvents(fetchText, storage, "https://example.test/events.json");

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Weinfest");
  });

  it("returns an empty array when the fetch fails and there is no cache", async () => {
    const fetchText = jest.fn().mockRejectedValue(new Error("offline"));
    const storage = makeStorage();

    const events = await getEvents(fetchText, storage, "https://example.test/events.json");

    expect(events).toEqual([]);
  });
});
