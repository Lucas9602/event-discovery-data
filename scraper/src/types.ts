export type AdapterType =
  | "ical"
  | "rss"
  | "schema-org"
  | "template-scraper"
  | "ai-generic"
  | "custom-scraper";

export const CATEGORIES = [
  "weinfest",
  "dorffest",
  "vereins-sportfest",
  "konzert",
  "markt",
  "sonstiges",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface Region {
  id: string;
  name: string;
  center: { lat: number; lon: number };
  parentRegion?: string;
}

export interface SourceLegal {
  basis: string;
  robotsChecked: string;
  notes?: string;
}

export interface Source {
  id: string;
  name: string;
  url: string;
  region: string;
  adapterType: AdapterType;
  adapterConfig: Record<string, unknown>;
  legal: SourceLegal;
  active: boolean;
}

export interface RawEvent {
  title: string;
  description?: string;
  start: string;
  end?: string;
  location?: { name?: string; address?: string; lat?: number; lon?: number };
  category?: string;
  sourceUrl: string;
}

export interface EventLocation {
  name?: string;
  address?: string;
  lat?: number;
  lon?: number;
}

export interface EventRecord {
  id: string;
  title: string;
  description?: string;
  start: string;
  end?: string;
  location: EventLocation;
  category: Category;
  sourceIds: string[];
  sourceUrl: string;
  region: string;
  lastSeenAt: string;
}

export type SourceHealthStatus = "ok" | "degraded" | "broken";

export interface SourceHealth {
  sourceId: string;
  lastRunAt: string;
  lastSuccessAt?: string;
  eventsFoundLastRun: number;
  consecutiveFailures: number;
  status: SourceHealthStatus;
}
