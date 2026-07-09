import { describe, expect, it, vi } from "vitest";
import { createAiGenericAdapter, type AnthropicLike } from "../../src/adapters/aiGeneric";
import type { Source } from "../../src/types";

const source: Source = {
  id: "test-ai-source",
  name: "Test AI Source",
  url: "https://example.test/portal",
  region: "test-region",
  adapterType: "ai-generic",
  adapterConfig: {},
  legal: { basis: "public", robotsChecked: "2026-07-03" },
  active: true,
};

describe("aiGeneric adapter", () => {
  it("sends the HTML to the model and parses the structured JSON response", async () => {
    const fakeClient: AnthropicLike = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                events: [
                  {
                    title: "Herbstfest",
                    start: "2026-10-10T16:00:00.000Z",
                    description: "Ein Fest im Herbst",
                    location: { name: "Dorfplatz" },
                  },
                ],
              }),
            },
          ],
        }),
      },
    };

    const adapter = createAiGenericAdapter(fakeClient);
    const events = await adapter.fetchEvents(source, async () => "<html>...</html>");

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Herbstfest");
    expect(events[0].sourceUrl).toBe(source.url);

    expect(fakeClient.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-haiku-4-5" }),
    );
  });

  it("returns an empty array if the model response has no parseable JSON", async () => {
    const fakeClient: AnthropicLike = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "not json" }],
        }),
      },
    };

    const adapter = createAiGenericAdapter(fakeClient);
    const events = await adapter.fetchEvents(source, async () => "<html></html>");
    expect(events).toEqual([]);
  });
});
