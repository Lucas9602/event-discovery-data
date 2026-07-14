import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { EventRecord } from "../lib/types";
import { cancelReminder, scheduleReminder } from "./reminders";

const STORAGE_KEY = "demo.favorites";
const STALE_AFTER_MS = 24 * 3600 * 1000;

interface FavoriteEntry {
  notificationId: string | null;
  start: string;
}

type FavoritesMap = Record<string, FavoriteEntry>;

interface FavoritesContextValue {
  isFavorite: (id: string) => boolean;
  toggleFavorite: (event: EventRecord) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

function pruneStale(favorites: FavoritesMap): FavoritesMap {
  const cutoff = Date.now() - STALE_AFTER_MS;
  const next: FavoritesMap = {};
  for (const [id, entry] of Object.entries(favorites)) {
    if (entry && new Date(entry.start).getTime() >= cutoff) next[id] = entry;
  }
  return next;
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<FavoritesMap>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!stored) return;
        setFavorites(pruneStale(JSON.parse(stored) as FavoritesMap));
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(favorites)).catch(() => {});
  }, [hydrated, favorites]);

  function isFavorite(id: string): boolean {
    return id in favorites;
  }

  function toggleFavorite(event: EventRecord) {
    setFavorites((current) => {
      if (event.id in current) {
        const notificationId = current[event.id].notificationId;
        if (notificationId) cancelReminder(notificationId).catch(() => {});
        const next = { ...current };
        delete next[event.id];
        return next;
      }

      scheduleReminder(event)
        .then((notificationId) => {
          setFavorites((latest) => {
            if (event.id in latest) return { ...latest, [event.id]: { notificationId, start: event.start } };
            if (notificationId) cancelReminder(notificationId).catch(() => {});
            return latest;
          });
        })
        .catch(() => {});

      return { ...current, [event.id]: { notificationId: null, start: event.start } };
    });
  }

  const value = useMemo<FavoritesContextValue>(() => ({ isFavorite, toggleFavorite }), [favorites]);

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites must be used within a FavoritesProvider");
  return ctx;
}
