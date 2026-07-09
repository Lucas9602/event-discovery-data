import Anthropic from "@anthropic-ai/sdk";
import type { RawEvent } from "../types";
import type { EventAdapter } from "./registry";

export interface AnthropicLike {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      messages: { role: "user"; content: string }[];
    }): Promise<{ content: { type: string; text?: string }[] }>;
  };
}

const EXTRACTION_PROMPT = `Du bekommst den HTML-Quelltext einer Veranstaltungsseite.
Extrahiere alle Events als JSON im folgenden Format, ohne zusätzlichen Text:
{"events": [{"title": string, "start": ISO-8601 string, "end"?: ISO-8601 string, "description"?: string, "location"?: {"name"?: string, "address"?: string}}]}
Wenn kein Datum eindeutig erkennbar ist, lass das Event weg. Antworte NUR mit dem JSON-Objekt.

HTML:
`;

function extractJson(text: string): { events: Partial<RawEvent>[] } | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export function createAiGenericAdapter(client: AnthropicLike): EventAdapter {
  return {
    type: "ai-generic",

    async fetchEvents(source, fetchText) {
      const html = await fetchText(source.url);
      const response = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 4096,
        messages: [{ role: "user", content: EXTRACTION_PROMPT + html }],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock?.text) return [];

      const parsed = extractJson(textBlock.text);
      if (!parsed?.events) return [];

      return parsed.events
        .filter((e): e is Partial<RawEvent> & { title: string; start: string } =>
          Boolean(e.title && e.start),
        )
        .map((e) => ({
          title: e.title,
          start: e.start,
          end: e.end,
          description: e.description,
          location: e.location,
          sourceUrl: source.url,
        }));
    },
  };
}

export const aiGenericAdapter = createAiGenericAdapter(new Anthropic());
