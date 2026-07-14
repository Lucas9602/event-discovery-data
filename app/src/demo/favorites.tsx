import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { EventRecord } from "../lib/types";
import { cancelReminder, scheduleReminder } from "./reminders";

const STORAGE_KEY = "demo.favorites";

type FavoritesMap = Record<string, string | null>;

interface FavoritesContextValue {
  isFavorite: (id: string) => boolean;
  toggleFavorite: (event: EventRecord) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<FavoritesMap>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!stored) return;
        setFavorites(JSON.parse(stored) as FavoritesMap);
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
        const notificationId = current[event.id];
        if (notificationId) cancelReminder(notificationId).catch(() => {});
        const next = { ...current };
        delete next[event.id];
        return next;
      }

      scheduleReminder(event)
        .then((notificationId) => {
          setFavorites((latest) => (event.id in latest ? { ...latest, [event.id]: notificationId } : latest));
        })
        .catch(() => {});

      return { ...current, [event.id]: null };
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
