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
  category: string;
  sourceIds: string[];
  sourceUrl: string;
  region: string;
  lastSeenAt: string;
}
