import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface LocationOrigin {
  lat: number;
  lon: number;
  label: string;
}

const STORAGE_KEY = "demo.location";
const DEFAULT_RADIUS_METERS = 25000;

interface StoredLocation {
  origin: LocationOrigin | null;
  radiusMeters: number;
}

interface LocationContextValue {
  origin: LocationOrigin | null;
  radiusMeters: number;
  setOrigin: (origin: LocationOrigin) => void;
  setRadiusMeters: (radius: number) => void;
}

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [origin, setOriginState] = useState<LocationOrigin | null>(null);
  const [radiusMeters, setRadiusMetersState] = useState(DEFAULT_RADIUS_METERS);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!stored) return;
        const parsed = JSON.parse(stored) as StoredLocation;
        if (parsed.origin) setOriginState(parsed.origin);
        if (typeof parsed.radiusMeters === "number") setRadiusMetersState(parsed.radiusMeters);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ origin, radiusMeters })).catch(() => {});
  }, [origin, radiusMeters]);

  function setOrigin(next: LocationOrigin) {
    setOriginState(next);
  }

  function setRadiusMeters(next: number) {
    setRadiusMetersState(next);
  }

  const value = useMemo<LocationContextValue>(
    () => ({ origin, radiusMeters, setOrigin, setRadiusMeters }),
    [origin, radiusMeters],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocation must be used within a LocationProvider");
  return ctx;
}
