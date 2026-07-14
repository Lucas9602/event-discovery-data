# Ort/PLZ-Geocoding + Onboarding-Hydration-Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual latitude/longitude input in `LocationOnboarding` with a single "Ort oder Postleitzahl" text field resolved via Nominatim geocoding, give the GPS path a real place-name label via reverse geocoding, and fix a 1-frame onboarding flash on app restart caused by async AsyncStorage hydration.

**Architecture:** A new pure module `app/src/lib/geocode.ts` wraps the Nominatim `/search` and `/reverse` HTTP APIs behind an injectable `fetchText` function, following the exact pattern already used by `getEvents`/`filterEvents` and by the server-side `scraper/src/geocode.ts`. `LocationOnboarding.tsx` calls it directly. `location.tsx` gains a `hydrated` boolean on its context so `DemoApp.tsx` can suppress rendering until the persisted location has actually loaded.

**Tech Stack:** React Native / Expo, Jest, `@testing-library/react-native`, Nominatim (OpenStreetMap) HTTP API, no new dependencies.

## Global Constraints

- Nominatim forward search URL: `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&q=<query>` (query URL-encoded).
- Nominatim reverse URL: `https://nominatim.openstreetmap.org/reverse?format=json&lat=<lat>&lon=<lon>`.
- Label shortening rule (both directions): take `display_name`, split on `,`, use the first segment trimmed. E.g. `"Ihringen, Landkreis Breisgau-Hochschwarzwald, Baden-Württemberg, Deutschland"` → `"Ihringen"`.
- No result (empty array from `/search`, or no `display_name` field from `/reverse`) → function returns `null`. Never throw for "not found" — only network/parse failures throw.
- Error copy (exact strings):
  - GPS unavailable/denied: `"Standort nicht verfügbar — bitte manuell eingeben."` (unchanged from before this plan)
  - Manual entry, no geocoding match: `"Ort nicht gefunden — bitte anders schreiben oder Postleitzahl versuchen."`
  - Manual entry, network/fetch failure: `"Verbindung fehlgeschlagen — bitte erneut versuchen."`
- GPS reverse-geocode failure is silent (no error shown) — falls back to the existing `formatCoordLabel(lat, lon)` string.
- `LocationOnboarding` keeps its existing public interface: `{ showRadiusSlider?: boolean; onDone?: () => void }`, `LocationOnboarding` remains the sole export.
- `useLocation()`'s existing fields (`origin`, `radiusMeters`, `setOrigin`, `setRadiusMeters`) are unchanged; only a new `hydrated: boolean` field is added.
- Scope: `app/src/lib/geocode.ts` (new), `app/__tests__/geocode.test.ts` (new), `app/src/demo/location.tsx`, `app/__tests__/location.test.tsx`, `app/src/demo/LocationOnboarding.tsx`, `app/src/demo/DemoApp.tsx`. No other files.

---

### Task 1: `geocode.ts` — Nominatim forward/reverse geocoding module

**Files:**
- Create: `app/src/lib/geocode.ts`
- Test: `app/__tests__/geocode.test.ts`

**Interfaces:**
- Produces: `GeocodeResult` (type: `{ lat: number; lon: number; label: string }`), `geocodeForward(query: string, fetchText: (url: string) => Promise<string>): Promise<GeocodeResult | null>`, `geocodeReverse(lat: number, lon: number, fetchText: (url: string) => Promise<string>): Promise<string | null>`.

- [ ] **Step 1: Write the failing tests**

Create `app/__tests__/geocode.test.ts`:

```ts
import { geocodeForward, geocodeReverse } from "../src/lib/geocode";

const FORWARD_RESPONSE = JSON.stringify([
  {
    lat: "48.0301",
    lon: "7.6501",
    display_name: "Ihringen, Landkreis Breisgau-Hochschwarzwald, Baden-Württemberg, Deutschland",
  },
]);
const EMPTY_RESPONSE = JSON.stringify([]);
const REVERSE_RESPONSE = JSON.stringify({
  display_name: "Ihringen, Landkreis Breisgau-Hochschwarzwald, Baden-Württemberg, Deutschland",
});
const REVERSE_NO_RESULT = JSON.stringify({ error: "Unable to geocode" });

describe("geocodeForward", () => {
  it("parses lat/lon and a shortened label from a Nominatim-style response", async () => {
    const fetchText = jest.fn().mockResolvedValue(FORWARD_RESPONSE);
    const result = await geocodeForward("Ihringen", fetchText);
    expect(result).toEqual({ lat: 48.0301, lon: 7.6501, label: "Ihringen" });
    expect(fetchText).toHaveBeenCalledWith(expect.stringContaining("nominatim.openstreetmap.org/search"));
    expect(fetchText).toHaveBeenCalledWith(expect.stringContaining("countrycodes=de"));
    expect(fetchText).toHaveBeenCalledWith(expect.stringContaining("q=Ihringen"));
  });

  it("returns null when there are no results", async () => {
    const fetchText = jest.fn().mockResolvedValue(EMPTY_RESPONSE);
    const result = await geocodeForward("Nonexistent Place XYZ", fetchText);
    expect(result).toBeNull();
  });
});

describe("geocodeReverse", () => {
  it("returns a shortened label from a Nominatim-style reverse response", async () => {
    const fetchText = jest.fn().mockResolvedValue(REVERSE_RESPONSE);
    const result = await geocodeReverse(48.03, 7.65, fetchText);
    expect(result).toBe("Ihringen");
    expect(fetchText).toHaveBeenCalledWith(expect.stringContaining("nominatim.openstreetmap.org/reverse"));
    expect(fetchText).toHaveBeenCalledWith(expect.stringContaining("lat=48.03"));
    expect(fetchText).toHaveBeenCalledWith(expect.stringContaining("lon=7.65"));
  });

  it("returns null when the response has no display_name", async () => {
    const fetchText = jest.fn().mockResolvedValue(REVERSE_NO_RESULT);
    const result = await geocodeReverse(0, 0, fetchText);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx jest geocode.test`
Expected: FAIL — `Cannot find module '../src/lib/geocode'`

- [ ] **Step 3: Implement `geocode.ts`**

Create `app/src/lib/geocode.ts`:

```ts
export interface GeocodeResult {
  lat: number;
  lon: number;
  label: string;
}

function shortLabel(displayName: string): string {
  return displayName.split(",")[0].trim();
}

export async function geocodeForward(
  query: string,
  fetchText: (url: string) => Promise<string>,
): Promise<GeocodeResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&q=${encodeURIComponent(query)}`;
  const text = await fetchText(url);
  const results = JSON.parse(text) as { lat: string; lon: string; display_name: string }[];

  if (results.length === 0) return null;

  const first = results[0];
  return { lat: parseFloat(first.lat), lon: parseFloat(first.lon), label: shortLabel(first.display_name) };
}

export async function geocodeReverse(
  lat: number,
  lon: number,
  fetchText: (url: string) => Promise<string>,
): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
  const text = await fetchText(url);
  const result = JSON.parse(text) as { display_name?: string };

  if (!result.display_name) return null;

  return shortLabel(result.display_name);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx jest geocode.test`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/geocode.ts app/__tests__/geocode.test.ts
git commit -m "feat: add Nominatim forward/reverse geocoding module"
```

---

### Task 2: `location.tsx` — add `hydrated` to the context

**Files:**
- Modify: `app/src/demo/location.tsx`
- Modify: `app/__tests__/location.test.tsx`

**Interfaces:**
- Produces: `useLocation()` gains a new field `hydrated: boolean` (starts `false`, becomes `true` once the initial `AsyncStorage.getItem` load has resolved — with or without a stored value, and even on a read error).

- [ ] **Step 1: Write the failing test**

In `app/__tests__/location.test.tsx`, update the `Probe` component to also render the hydrated flag, and add a new test. Replace the `Probe` function with:

```tsx
function Probe() {
  const { origin, radiusMeters, hydrated, setOrigin, setRadiusMeters } = useLocation();
  return (
    <>
      <Text>{origin ? origin.label : "none"}</Text>
      <Text>{radiusMeters}</Text>
      <Text>{hydrated ? "hydrated:true" : "hydrated:false"}</Text>
      <Pressable onPress={() => setOrigin({ lat: 48.03, lon: 7.65, label: "Ihringen" })}>
        <Text>set-origin</Text>
      </Pressable>
      <Pressable onPress={() => setRadiusMeters(10000)}>
        <Text>set-radius</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          setOrigin({ lat: 50.11, lon: 8.68, label: "Bothtown" });
          setRadiusMeters(12345);
        }}
      >
        <Text>set-both</Text>
      </Pressable>
    </>
  );
}
```

Add this new test inside `describe("LocationProvider", ...)`, after the existing `"loads a persisted origin and radius on mount"` test:

```tsx
  it("hydrated becomes true once the initial load resolves, with or without a persisted value", async () => {
    await render(
      <LocationProvider>
        <Probe />
      </LocationProvider>,
    );
    expect(await screen.findByText("hydrated:true")).toBeTruthy();
  });
```

- [ ] **Step 2: Run tests to verify the new test fails**

Run: `cd app && npx jest location.test`
Expected: FAIL — `useLocation` does not return a `hydrated` field, so `screen.findByText("hydrated:true")` times out (the `Probe` component renders `"hydrated:false"` forever since `hydrated` is `undefined`, which is falsy).

- [ ] **Step 3: Add `hydrated` to `location.tsx`**

Replace `app/src/demo/location.tsx` with:

```tsx
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
  hydrated: boolean;
  setOrigin: (origin: LocationOrigin) => void;
  setRadiusMeters: (radius: number) => void;
}

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [origin, setOriginState] = useState<LocationOrigin | null>(null);
  const [radiusMeters, setRadiusMetersState] = useState(DEFAULT_RADIUS_METERS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!stored) return;
        const parsed = JSON.parse(stored) as StoredLocation;
        if (parsed.origin) setOriginState(parsed.origin);
        if (typeof parsed.radiusMeters === "number") setRadiusMetersState(parsed.radiusMeters);
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ origin, radiusMeters })).catch(() => {});
  }, [hydrated, origin, radiusMeters]);

  function setOrigin(next: LocationOrigin) {
    setOriginState(next);
  }

  function setRadiusMeters(next: number) {
    setRadiusMetersState(next);
  }

  const value = useMemo<LocationContextValue>(
    () => ({ origin, radiusMeters, hydrated, setOrigin, setRadiusMeters }),
    [origin, radiusMeters, hydrated],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocation must be used within a LocationProvider");
  return ctx;
}
```

Note: this replaces the previous `hydrated` `useRef` guard with a `useState` used both for gating the persist effect (via the dependency array, same protection as before — the effect only fires when triggered, and the initial mount-time run sees `hydrated === false` and returns early, same as the ref did) and for exposing it to consumers.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx jest location.test`
Expected: PASS (all tests, including the new one — 7 total)

- [ ] **Step 5: Commit**

```bash
git add app/src/demo/location.tsx app/__tests__/location.test.tsx
git commit -m "feat: expose hydrated flag from LocationProvider"
```

---

### Task 3: `LocationOnboarding.tsx` — Ort/PLZ field + reverse-geocoded GPS label

**Files:**
- Modify: `app/src/demo/LocationOnboarding.tsx`

**Interfaces:**
- Consumes: `geocodeForward`, `geocodeReverse` (Task 1), `useLocation()` (Task 2, only uses the pre-existing `radiusMeters`/`setOrigin`/`setRadiusMeters` fields — does not need `hydrated`).
- Produces: no interface change — `LocationOnboarding({ showRadiusSlider, onDone })` stays the same as before this plan.

- [ ] **Step 1: Replace the file contents**

Replace `app/src/demo/LocationOnboarding.tsx` with:

```tsx
import Slider from "@react-native-community/slider";
import * as Location from "expo-location";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { geocodeForward, geocodeReverse } from "../lib/geocode";
import { useLocation } from "./location";
import { useTheme } from "./theme";

const LOCATION_ERROR = "Standort nicht verfügbar — bitte manuell eingeben.";
const NOT_FOUND_ERROR = "Ort nicht gefunden — bitte anders schreiben oder Postleitzahl versuchen.";
const NETWORK_ERROR = "Verbindung fehlgeschlagen — bitte erneut versuchen.";

function formatCoordLabel(lat: number, lon: number): string {
  return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
}

function fetchText(url: string): Promise<string> {
  return fetch(url).then((res) => res.text());
}

interface LocationOnboardingProps {
  showRadiusSlider?: boolean;
  onDone?: () => void;
}

export function LocationOnboarding({ showRadiusSlider = false, onDone }: LocationOnboardingProps) {
  const { colors } = useTheme();
  const { radiusMeters, setOrigin, setRadiusMeters } = useLocation();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.surface, padding: 20, justifyContent: "center", gap: 16 },
        title: { fontSize: 18, fontWeight: "800", color: colors.text, textAlign: "center" },
        button: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 12, alignItems: "center" },
        buttonText: { color: colors.onAccent, fontWeight: "700", fontSize: 14 },
        error: { color: "#b3123d", fontSize: 12, textAlign: "center" },
        input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, color: colors.text },
        confirmButton: { borderWidth: 1.5, borderColor: colors.accent, borderRadius: 14, paddingVertical: 10, alignItems: "center" },
        confirmButtonText: { color: colors.accent, fontWeight: "700", fontSize: 13 },
        radiusLabel: { fontSize: 12, color: colors.textMuted, textAlign: "center" },
      }),
    [colors],
  );

  async function useDeviceLocation() {
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError(LOCATION_ERROR);
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      const reverseLabel = await geocodeReverse(lat, lon, fetchText).catch(() => null);
      setOrigin({ lat, lon, label: reverseLabel ?? formatCoordLabel(lat, lon) });
      onDone?.();
    } catch {
      setError(LOCATION_ERROR);
    }
  }

  async function confirmManual() {
    if (!query.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const result = await geocodeForward(query, fetchText);
      if (!result) {
        setError(NOT_FOUND_ERROR);
        return;
      }
      setOrigin(result);
      onDone?.();
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Wo bist du unterwegs?</Text>
      <Pressable style={styles.button} onPress={useDeviceLocation}>
        <Text style={styles.buttonText}>Standort verwenden</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TextInput
        placeholder="Ort oder Postleitzahl"
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={setQuery}
        style={styles.input}
      />
      <Pressable style={styles.confirmButton} onPress={confirmManual} disabled={loading}>
        {loading ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.confirmButtonText}>Bestätigen</Text>}
      </Pressable>
      {showRadiusSlider ? (
        <>
          <Text style={styles.radiusLabel}>Umkreis: {Math.round(radiusMeters / 1000)} km</Text>
          <Slider minimumValue={1000} maximumValue={100000} value={radiusMeters} onValueChange={setRadiusMeters} />
          <Pressable style={styles.confirmButton} onPress={() => onDone?.()}>
            <Text style={styles.confirmButtonText}>Fertig</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 2: Verify**

Run: `cd app && npx tsc --noEmit` — expect only the known pre-existing `StyleSheet.absoluteFillObject` errors (in `EventPostCard.tsx`/`MapScreen.tsx`), nothing new.
Run: `cd app && npx jest` (full suite) — expect all passing (this component has no direct automated test, per the established convention for this file — confirms nothing else broke).

- [ ] **Step 3: Commit**

```bash
git add app/src/demo/LocationOnboarding.tsx
git commit -m "feat: replace lat/lon input with Ort/PLZ geocoding, reverse-geocode GPS label"
```

---

### Task 4: `DemoApp.tsx` — suppress render until `hydrated`

**Files:**
- Modify: `app/src/demo/DemoApp.tsx`

**Interfaces:**
- Consumes: `useLocation()`'s new `hydrated` field (Task 2).
- Produces: no interface change — `DemoApp` remains the sole export.

- [ ] **Step 1: Add the hydration gate**

In `app/src/demo/DemoApp.tsx`, inside `DemoAppContent`, change the `useLocation()` destructure and add an early return. The function currently starts like this:

```tsx
function DemoAppContent() {
  const [tab, setTab] = useState<DemoTab>("feed");
  const { colors } = useTheme();
  const { origin } = useLocation();
  const styles = useMemo(
```

Change the `useLocation()` line and add the early return right after the `styles` block closes (before the `const screen = (` line):

```tsx
function DemoAppContent() {
  const [tab, setTab] = useState<DemoTab>("feed");
  const { colors } = useTheme();
  const { origin, hydrated } = useLocation();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.surface },
        webDesk: { flex: 1, alignItems: "center", backgroundColor: colors.background, paddingVertical: 24 },
        webPhone: {
          width: 390,
          height: 780,
          borderRadius: 28,
          overflow: "hidden",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.25,
          shadowRadius: 40,
          elevation: 12,
        },
      }),
    [colors],
  );

  if (!hydrated) return null;

  const screen = (
```

Everything else in the file (the `screen` JSX and the `Platform.OS !== "web"` branch) is unchanged.

- [ ] **Step 2: Manual verification**

Run: `cd app && npm run web` (skip if already running). Open in a private/incognito browser window (fresh `localStorage`). Confirm: no flash of the onboarding screen before it settles — since there's no persisted location yet, you should go straight to (and stay on) the onboarding screen, no flicker. Enter a place name (e.g. `Ihringen`) or a postal code (e.g. `79241`) in the new single field and confirm — a loading indicator should show briefly, then the tab UI appears. Reload the page — confirm the tab UI appears directly with no onboarding flash at all (this is the actual regression test for the hydration fix: previously this reload would show a 1-frame flash of the onboarding screen).

- [ ] **Step 3: Commit**

```bash
git add app/src/demo/DemoApp.tsx
git commit -m "fix: suppress render until location state is hydrated"
```

---

## Full Test Suite Check

After Task 4, run the complete suite once more to confirm nothing else broke:

Run: `cd app && npx jest`
Expected: all suites PASS, including the new `geocode.test.ts`, the updated `location.test.tsx`, and every pre-existing suite untouched by this plan.
