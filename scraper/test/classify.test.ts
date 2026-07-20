import { describe, expect, it, vi } from "vitest";
import type { AnthropicLike } from "../src/adapters/aiGeneric";
import { classifyUncategorized } from "../src/classify";
import type { EventRecord } from "../src/types";

function makeEvent(overrides: Partial<EventRecord>): EventRecord {
  return {
    id: overrides.id ?? "evt-1",
    title: overrides.title ?? "Herbstliches Beisammensein",
    description: overrides.description,
    start: "2026-10-10T16:00:00.000Z",
    location: {},
    category: overrides.category ?? "sonstiges",
    sourceIds: ["src-1"],
    sourceUrl: "https://example.test/event",
    region: "test-region",
    lastSeenAt: "2026-07-20T00:00:00.000Z",
    ...overrides,
  };
}

function fakeClient(responseText: string): AnthropicLike {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({ content: [{ type: "text", text: responseText }] }),
    },
  };
}

describe("classifyUncategorized", () => {
  it("only sends events already bucketed as sonstiges to the model", async () => {
    const events = [
      makeEvent({ id: "a", category: "sonstiges" }),
      makeEvent({ id: "b", category: "weinfest" }),
    ];
    const client = fakeClient(JSON.stringify(["kultur"]));

    const result = await classifyUncategorized(events, client);

    expect(client.messages.create).toHaveBeenCalledTimes(1);
    expect(result.find((e) => e.id === "a")?.category).toBe("kultur");
    expect(result.find((e) => e.id === "b")?.category).toBe("weinfest");
  });

  it("skips the API call entirely when nothing is uncategorized", async () => {
    const events = [makeEvent({ id: "a", category: "markt" })];
    const client = fakeClient("[]");

    const result = await classifyUncategorized(events, client);

    expect(client.messages.create).not.toHaveBeenCalled();
    expect(result).toEqual(events);
  });

  it("leaves the category unchanged when the model returns an invalid label", async () => {
    const events = [makeEvent({ id: "a", category: "sonstiges" })];
    const client = fakeClient(JSON.stringify(["not-a-real-category"]));

    const result = await classifyUncategorized(events, client);

    expect(result[0].category).toBe("sonstiges");
  });

  it("leaves categories unchanged when the response has no parseable JSON array", async () => {
    const events = [makeEvent({ id: "a", category: "sonstiges" })];
    const client = fakeClient("Entschuldigung, ich kann das nicht beantworten.");

    const result = await classifyUncategorized(events, client);

    expect(result[0].category).toBe("sonstiges");
  });

  it("batches requests when there are more targets than batchSize", async () => {
    const events = [
      makeEvent({ id: "a", category: "sonstiges" }),
      makeEvent({ id: "b", category: "sonstiges" }),
      makeEvent({ id: "c", category: "sonstiges" }),
    ];
    const client: AnthropicLike = {
      messages: {
        create: vi
          .fn()
          .mockResolvedValueOnce({ content: [{ type: "text", text: JSON.stringify(["kultur", "markt"]) }] })
          .mockResolvedValueOnce({ content: [{ type: "text", text: JSON.stringify(["konzert"]) }] }),
      },
    };

    const result = await classifyUncategorized(events, client, 2);

    expect(client.messages.create).toHaveBeenCalledTimes(2);
    expect(result.map((e) => e.category)).toEqual(["kultur", "markt", "konzert"]);
  });

  it("keeps events already-resolved before an error mid-batch, and leaves the rest unchanged", async () => {
    const events = [
      makeEvent({ id: "a", category: "sonstiges" }),
      makeEvent({ id: "b", category: "sonstiges" }),
    ];
    const client: AnthropicLike = {
      messages: {
        create: vi
          .fn()
          .mockResolvedValueOnce({ content: [{ type: "text", text: JSON.stringify(["kultur"]) }] })
          .mockRejectedValueOnce(new Error("rate limited")),
      },
    };

    await expect(classifyUncategorized(events, client, 1)).rejects.toThrow("rate limited");
  });
});
