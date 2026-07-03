import type { RawEvent, Source } from "../types";

export interface EventAdapter {
  type: string;
  fetchEvents(
    source: Source,
    fetchText: (url: string) => Promise<string>,
  ): Promise<RawEvent[]>;
}

export const adapterRegistry = new Map<string, EventAdapter>();

export function registerAdapter(adapter: EventAdapter): void {
  adapterRegistry.set(adapter.type, adapter);
}

export function getAdapter(type: string): EventAdapter {
  const adapter = adapterRegistry.get(type);
  if (!adapter) {
    throw new Error(`No adapter registered for type "${type}"`);
  }
  return adapter;
}
