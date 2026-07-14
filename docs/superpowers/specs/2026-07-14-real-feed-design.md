# Real Data in the Demo-Design App

## Goal

The demo scaffold in `app/src/demo/` was built to preview the app's visual
design (dark mode, cards, tab bar) against fake data. This spec makes the
**Feed tab** show real scraped events (via the existing `getEvents`/
`filterEvents`/`EventRecord` pipeline in `app/src/lib`) and adds a
first-launch location onboarding flow, while keeping the demo's visual
design as the app's actual design going forward.

Scope, per user decision: only the **Feed** tab becomes real. **Karte**,
**Freunde**, and the rest of **Profil** stay exactly as they are today
(demo/mock data) — they have no backend concept yet and are out of scope.
The only change to Profil is wiring the existing "Standort ändern" row to
a real location/radius editor, and showing the real location/radius in the
profile header instead of the hardcoded "Ihringen · 25 km".

The old `app/src/screens/EventListScreen.tsx` (+ its `FilterBar`) becomes
dead code once this ships — the demo's `FeedScreen` replaces it as the
production feed. It is not deleted by this spec (out of scope; a cleanup
task can remove it later once this is confirmed working), but `App.tsx`
already only renders `DemoApp`, so `EventListScreen` was already
unreachable before this work.

## Architecture

Two new modules in `app/src/demo/`, following the existing `theme.tsx`
pattern (React Context + hook + AsyncStorage persistence):

- **`eventDisplay.ts`** — a pure function `toDisplayEvent(event: EventRecord): DemoEvent`
  that derives `accent` and `image` from `event.category`, so the existing
  `EventPostCard` (which expects `DemoEvent`, i.e. `EventRecord & { image, accent }`)
  keeps working unchanged on real data. Category mapping (reusing the
  colors/photo style already established in `demoData.ts` for the first
  four, extended to cover all six categories used by `CATEGORY_LABELS` in
  `EventPostCard.tsx`):

  | category | accent | image (picsum seed) |
  |---|---|---|
  | `weinfest` | `#b3123d` | `lokalfeste-wein` |
  | `dorffest` | `#3a6b5c` | `lokalfeste-sommer` |
  | `vereins-sportfest` | `#c07a1e` | `lokalfeste-sport` |
  | `markt` | `#5b3a6e` | `lokalfeste-markt` |
  | `konzert` | `#2b5f8a` | `lokalfeste-konzert` |
  | `sonstiges` | `#5a5a5a` | `lokalfeste-sonstiges` |

  Image URL format matches the existing demo convention:
  `https://picsum.photos/seed/<seed>/700/700`. An unrecognized category
  (defensive fallback, should not happen given `EventRecord.category` is
  always one of these six) falls back to the `sonstiges` entry.

- **`location.tsx`** — `LocationProvider` (React Context) + `useLocation()`
  hook, mirroring `theme.tsx`'s shape:
  ```ts
  interface LocationState {
    origin: { lat: number; lon: number; label: string } | null;
    radiusMeters: number;
    setOrigin: (origin: { lat: number; lon: number; label: string }) => void;
    setRadiusMeters: (radius: number) => void;
  }
  ```
  Persisted to AsyncStorage under key `demo.location` (JSON-serialized
  `{ origin, radiusMeters }`). `origin` starts `null` until the user
  completes onboarding or picks a location; `radiusMeters` defaults to
  `25000` (25 km, matching the existing UI copy and `FilterBar`'s prior
  default). `label` is a short human-readable string for display (e.g.
  "Ihringen" for device-detected/named locations, or `"48.03, 7.65"`
  formatted-coordinate text for manual entry with no name available).

`DemoApp.tsx` wraps its tree in `<LocationProvider>` alongside the existing
`<ThemeProvider>` (order: `ThemeProvider` outer, `LocationProvider` inner —
no dependency between them, order is arbitrary but must be consistent).
Inside, if `useLocation().origin` is `null`, render `LocationOnboarding`
instead of the normal tab content; once `origin` is set, the normal
Feed/Karte/Freunde/Profil tab UI renders.

## Onboarding flow

New component `app/src/demo/LocationOnboarding.tsx`, theme-aware (uses
`useTheme()` like every other screen), shown full-screen in place of the
tab UI when `useLocation().origin === null`:

- A primary button "Standort verwenden" — calls
  `expo-location`'s `requestForegroundPermissionsAsync()` +
  `getCurrentPositionAsync()` (same calls already used in
  `EventListScreen.tsx`'s `getCurrentPosition`). No reverse geocoding is
  performed (no such dependency exists in this project yet, and adding one
  is out of scope here) — on success, calls
  `setOrigin({ lat, lon, label: "<lat>, <lon>" })` with 2-decimal-rounded
  coordinates as the label, for both the device-location and manual-entry
  paths.
- A manual entry fallback: two numeric text inputs (latitude, longitude,
  reusing the existing `LocationInput`-style manual entry, restyled to
  match the demo's visual language) with a "Bestätigen" button, enabled
  once both fields parse as valid floats. Label for manual entry is also
  the formatted coordinate string.
- If the device-location permission is denied or the call throws, show an
  inline error line ("Standort nicht verfügbar — bitte manuell eingeben.")
  and leave the manual entry visible (it's always visible below the
  button, not hidden until an error — simplest layout, no conditional
  reveal needed).
- Radius is NOT configurable during onboarding — it's fixed at the
  `LocationProvider` default (25 km) and only becomes editable afterward
  via Profil's "Standort ändern".

## Feed data wiring

`FeedScreen.tsx` changes from importing `demoEvents` to:

1. On mount, `useEffect` calls
   `getEvents((url) => fetch(url).then((r) => r.text()), AsyncStorage, EVENTS_URL)`
   (same `EVENTS_URL` constant currently in `EventListScreen.tsx`, moved to
   a shared location — `app/src/lib/getEvents.ts` is a reasonable home for
   the constant, or keep it local to `FeedScreen.tsx`; implementer's call,
   not a design-significant detail) and stores the result in state.
2. Reads `{ origin, radiusMeters }` from `useLocation()`.
3. Computes `visibleEvents = filterEvents(events, origin ? { origin, radiusMeters } : {})`
   (guarded because `FeedScreen` only ever renders once onboarding is
   complete, so `origin` is non-null in practice, but the type is nullable
   so the guard keeps this honest).
4. Maps `visibleEvents.map(toDisplayEvent)` and renders exactly as today
   via `FlatList`/`EventPostCard` — no changes to `EventPostCard` itself.
5. Topbar subtitle becomes dynamic:
   `` `Alle Feste · ${Math.round(radiusMeters / 1000)} km um ${origin?.label ?? ""}` ``
   replacing the hardcoded `"Alle Feste · 25 km um Ihringen"`.

No loading spinner or empty-state message — an empty list while data
loads, or if zero events are in range, renders as just an empty `FlatList`
(matches the "no error handling for scenarios that can't meaningfully
degrade further" principle; this is a prototype-stage app, and
`getEvents` already handles fetch failure by falling back to any
AsyncStorage-cached copy).

## Profil "Standort ändern" + real header

`ProfileScreen.tsx` changes:

- The profile header's `loc` text changes from the hardcoded
  `"Standort: Ihringen · 25 km Umkreis"` to
  `` `Standort: ${origin?.label ?? "Nicht gesetzt"} · ${Math.round(radiusMeters / 1000)} km Umkreis` ``
  reading from `useLocation()`.
- Tapping the existing "Standort ändern" row toggles local component state
  (`const [editingLocation, setEditingLocation] = useState(false)`) that,
  when true, renders `LocationOnboarding` in place of the normal settings
  list content — same component reused from onboarding, not a second
  implementation. The only difference from the onboarding usage: because
  `origin` is already set, `LocationOnboarding` also shows a radius
  `Slider` (`@react-native-community/slider`, already a project
  dependency) between the location controls and the confirm action,
  wired to `setRadiusMeters`. Add an optional prop to `LocationOnboarding`,
  e.g. `showRadiusSlider?: boolean`, defaulting to `false` (onboarding
  usage) and passed `true` from `ProfileScreen`. Confirming (or completing
  a new location pick) sets `editingLocation` back to `false`, returning
  to the normal settings list.

## Error handling

- Location permission denied / `getCurrentPositionAsync` throws: caught,
  shows the inline error line described above; does not crash the
  onboarding screen.
- `getEvents` network failure: already handled by the existing
  implementation (falls back to AsyncStorage cache, or an empty array if
  no cache exists yet) — no new handling needed in `FeedScreen`.
- AsyncStorage read/write failures for `demo.location`: caught and
  ignored, same pattern as `theme.tsx` (falls back to `origin: null`,
  i.e. onboarding shows again — acceptable for a prototype).

## Testing

Automated (TDD, following the `theme.test.tsx` / `ProfileScreen.test.tsx`
convention already in the repo):

- **`app/__tests__/eventDisplay.test.ts`** — pure function, table-driven:
  for each of the 6 categories, asserts the correct `accent` and `image`
  are attached; asserts an unrecognized category falls back to the
  `sonstiges` entry; asserts all other `EventRecord` fields pass through
  unchanged.
- **`app/__tests__/location.test.tsx`** — mirrors `theme.test.tsx`'s
  structure: defaults to `origin: null` with no persisted value, persists
  `setOrigin`/`setRadiusMeters` calls to AsyncStorage under `demo.location`,
  and loads a persisted value on mount.

Manual verification (per the existing project convention — component/UI
screens are checked visually, not via automated rendering tests):
onboarding flow (device-location happy path is not testable without a
real device/emulator location fixture, so manually verify the manual-entry
path and the permission-denied error message), Feed showing real fetched
events with correct category-derived photos/colors, Profil's "Standort
ändern" round-trip (open editor, change radius, confirm, see updated
header text and updated Feed results).
