import type { AnthropicLike } from "./adapters/aiGeneric";
import { CATEGORIES, type Category, type EventRecord } from "./types";

const REAL_CATEGORIES = CATEGORIES.filter((c) => c !== "sonstiges");
const DEFAULT_BATCH_SIZE = 40;

function buildPrompt(events: EventRecord[]): string {
  const list = events
    .map((e, i) => {
      const description = e.description ? ` — ${e.description.slice(0, 200)}` : "";
      return `${i}. ${e.title}${description}`;
    })
    .join("\n");

  return `Ordne jeder Veranstaltung genau eine dieser Kategorien zu: ${REAL_CATEGORIES.join(", ")}.
Antworte NUR mit einem JSON-Array von Strings in derselben Reihenfolge wie die Liste, ein Kategorie-Wert pro Veranstaltung.
Wenn wirklich keine Kategorie passt, benutze "sonstiges".

Veranstaltungen:
${list}`;
}

// The model sometimes wraps the array in prose despite instructions not to,
// so we search for the array pattern rather than requiring an exact match.
function parseLabels(text: string): unknown[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

// Only re-classifies events the keyword heuristic (normalizeCategory) already
// bucketed as "sonstiges" - the common case is already handled for free, so
// this keeps the paid API call count to the actual ambiguous minority.
export async function classifyUncategorized(
  events: EventRecord[],
  client: AnthropicLike,
  batchSize: number = DEFAULT_BATCH_SIZE,
): Promise<EventRecord[]> {
  const targets = events.filter((e) => e.category === "sonstiges");
  if (targets.length === 0) return events;

  const resolved = new Map<string, Category>();

  for (let i = 0; i < targets.length; i += batchSize) {
    const chunk = targets.slice(i, i + batchSize);
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: buildPrompt(chunk) }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock?.text) continue;

    const labels = parseLabels(textBlock.text);
    chunk.forEach((event, idx) => {
      const label = labels[idx];
      if (isCategory(label)) {
        resolved.set(event.id, label);
      }
    });
  }

  if (resolved.size === 0) return events;
  return events.map((e) => (resolved.has(e.id) ? { ...e, category: resolved.get(e.id)! } : e));
}
