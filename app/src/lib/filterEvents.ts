import { distanceMeters } from "./geo";
import type { EventRecord } from "./types";

export interface EventFilters {
  origin?: { lat: number; lon: number };
  radiusMeters?: number;
  dateFrom?: string;
  dateTo?: string;
}

function hasCoords(event: EventRecord): boolean {
  return typeof event.location.lat === "number" && typeof event.location.lon === "number";
}

export function filterEvents(events: EventRecord[], filters: EventFilters): EventRecord[] {
  return events.filter((event) => {
    if (filters.origin && filters.radiusMeters !== undefined) {
      if (!hasCoords(event)) return false;
      const distance = distanceMeters(filters.origin, {
        lat: event.location.lat!,
        lon: event.location.lon!,
      });
      if (distance > filters.radiusMeters) return false;
    }

    if (filters.dateFrom && event.start < filters.dateFrom) return false;
    if (filters.dateTo && event.start > filters.dateTo) return false;

    return true;
  });
}
