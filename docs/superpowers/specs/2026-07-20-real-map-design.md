# Real Interactive Map for the Karte Tab

## Goal

The `Karte` tab is currently a mock: a static OpenStreetMap tile image with
hardcoded `demoEvents` pins at fixed percentage positions. This spec makes
it a real, interactive map showing real scraped events, filtered the same
way the Feed is (location/radius + category/Zeitraum filters), with
zoom-dependent marker clustering. Freunde and the rest of Profil remain out
of scope (unchanged from the last spec's decision).

Two behaviors requested by the user, both must hold:

1. **Shared filters** — changing the category/Zeitraum filter on either the
   Feed or the Karte tab affects both. They are not independent per-tab
   selections.
2. **Clustering** — events close together merge into a single cluster
   marker; zooming in splits clusters apart; zooming out re-merges them.
   Standard zoom-dependent map clustering, not a fixed grid.

## Architecture

### Shared filter state — `app/src/demo/filters.tsx`

New React Context + hook, same shape/pattern as `theme.tsx`/`location.tsx`
(no persistence needed — filters are a runtime session concern, not
something that should survive app restart, matching how they behave
today as `FeedScreen` local state):

```ts
interface FilterContextValue {
  selectedCategories: string[];
  zeitraum: ZeitraumOption;
  customFrom: string;
  customTo: string;
  toggleCategory: (value: string) => void;
  setZeitraum: (value: ZeitraumOption) => void;
  setCustomFrom: (value: string) => void;
  setCustomTo: (value: string) => void;
  resetFilters: () => void;
}
```

`toggleCategory`/`resetFilters` behavior is lifted verbatim from
`FeedScreen.tsx`'s current local implementation (the `"alle"` sentinel
clears the whole array; otherwise add/remove from the array). `DemoApp.tsx`
adds `<FilterProvider>` alongside the existing `<ThemeProvider>` /
`<LocationProvider>` / `<FavoritesProvider>` (order doesn't matter, no
cross-dependency).

### Shared filter UI — `app/src/demo/FilterModal.tsx`

Extracted from `FeedScreen.tsx`'s current inline `<Modal>` JSX
(sheet/backdrop/category chips/Zeitraum chips/custom date inputs/reset+apply
buttons), unchanged in appearance and behavior, but reading/writing
`useFilters()` instead of local state. Props: `visible: boolean`,
`onClose: () => void` — the modal's own open/close state stays local to
each screen (each tab has its own filter icon + its own
`filterModalVisible` state), only the filter *values* are shared.

`FeedScreen.tsx` changes: removes its local `selectedCategories`/`zeitraum`/
`customFrom`/`customTo` state and `toggleCategory`/`resetFilters` functions,
reads them from `useFilters()` instead, renders `<FilterModal visible={...} onClose={...} />`
instead of the inline JSX. Its own filter-icon button and
`filterModalVisible` state stay as they are today.

### MapScreen — `app/src/demo/MapScreen.tsx` (rewritten)

- Fetches events the same way `FeedScreen` does: `getEvents(fetchText,
  AsyncStorage, EVENTS_URL)` on mount (same `EVENTS_URL` constant,
  duplicated per-screen exactly like Feed/Profil already do today — no new
  shared-fetch/cache layer; that de-dup was already flagged as a known,
  accepted non-blocking gap in an earlier review, out of scope here).
- Reads `{ origin, radiusMeters }` from `useLocation()` and
  `{ selectedCategories, zeitraum, customFrom, customTo }` from
  `useFilters()`.
- Computes visible events via the *same* `filterEvents()` call shape
  `FeedScreen` uses (origin+radius, categories, dateFrom/dateTo derived via
  `zeitraumToDateRange`/`toStartOfDayIso`/`toEndOfDayIso` — identical logic,
  copy the derivation, don't fork it).
- **Map-specific extra filter**: events without `location.lat`/`location.lon`
  are dropped (can't place a pin with no coordinates) — this is the one
  place Karte's visible set differs from Feed's.
- Own filter-icon button + own `filterModalVisible` state + own
  `<FilterModal>` instance, exactly mirroring `FeedScreen`'s pattern (shared
  values, independent modal-open state, so opening the popup on one tab
  doesn't pop it open on the other).
- Renders the actual map via a new small cross-platform component (below).
- Tapping a marker shows the existing bottom "sheet" (title + location
  name/address) already present in the mock, wired to the tapped event's
  real data instead of `demoEvents[0]`.
- Tapping a cluster zooms the map to fit that cluster's bounds (the
  clustering library's default behavior — no custom logic needed).
- Empty state (no events with coordinates within the current filter/radius):
  same visual pattern as `FeedScreen`'s filtered-empty-state text, adapted
  wording ("Keine Feste mit Standort in diesem Umkreis gefunden.").

### Cross-platform map component — `app/src/demo/LeafletMap.tsx` / `.web.tsx`

Two files, resolved automatically by Metro's platform-extension convention
(`LeafletMap.web.tsx` wins on web, `LeafletMap.tsx` on iOS/Android) — the
same interface on both sides:

```ts
interface LeafletMapProps {
  center: { lat: number; lon: number };
  markers: { id: string; lat: number; lon: number; title: string }[];
  onMarkerPress: (id: string) => void;
}
```

- **`LeafletMap.web.tsx`** — `react-leaflet`'s `MapContainer`/`TileLayer`
  (standard `tile.openstreetmap.org` tiles, same free/no-key tile source
  the mock's static image already used) + `react-leaflet-cluster` wrapping
  `Marker`s. `onMarkerPress` fires from each `Marker`'s `eventHandlers.click`.
- **`LeafletMap.tsx`** (native) — `react-native-webview`'s `WebView`
  rendering a self-contained HTML string (Leaflet + Leaflet.markercluster
  loaded from a CDN `<script>`/`<link>` tag inside the HTML — no extra
  native package beyond `react-native-webview` itself). Markers are
  injected into the HTML as a JSON array at render time; tapping a marker
  runs `window.ReactNativeWebView.postMessage(id)` inside the page, caught
  via the `WebView`'s `onMessage` prop and forwarded to `onMarkerPress`.

New dependencies: `leaflet`, `react-leaflet`, `react-leaflet-cluster` (web
only, but installed as regular deps since Metro's bundler needs them
resolvable even if only the `.web.tsx` file imports them), and
`react-native-webview` (installed via `npx expo install react-native-webview`
for correct version pinning, matching this project's established
convention of never hand-typing Expo package versions).

## Error handling

- `getEvents` failure: already handled by the existing implementation
  (AsyncStorage fallback / empty array) — no new handling needed.
- Events with malformed/out-of-range coordinates: not specially validated
  beyond the existing `typeof lat === "number" && typeof lon === "number"`
  check already used elsewhere in this codebase (e.g. `filterEvents.ts`'s
  `hasCoords`) — reused as-is, not reinvented.
- WebView/tile load failure on native: no custom fallback UI — out of
  scope for this prototype-stage app (matches this project's established
  standard of not adding error handling for scenarios that aren't the
  common case).

## Testing

- **`app/__tests__/filters.test.tsx`** — mirrors `location.test.tsx`'s
  structure: default state (`selectedCategories: []`, `zeitraum: "alle"`),
  `toggleCategory` add/remove/`"alle"`-clears-all behavior, `resetFilters`.
- **`app/__tests__/FilterModal.test.tsx`** — same assertions the current
  inline-modal behavior gets today via `FeedScreen.test.tsx` (chip tap
  toggles selection, reset button clears, Zeitraum stays single-select),
  now against the extracted component directly with a wrapping
  `FilterProvider`.
- **`app/__tests__/FeedScreen.test.tsx`** — updated to wrap with
  `FilterProvider` (same mechanical update `ProfileScreen.test.tsx` got
  when `LocationProvider` was introduced); behavior assertions unchanged.
- A pure function extracted for the map-specific coordinate filter (e.g.
  `eventsWithCoords(events: EventRecord[]): EventRecord[]`) gets its own
  table-driven test (has both/one/neither coordinate → included/excluded).
- The actual Leaflet/WebView rendering is not unit-tested (external
  library, matches this project's existing stance on e.g. not deep-testing
  `expo-notifications` internals) — verified instead by running the web
  build in a real browser (Playwright) and visually confirming: markers
  appear at real event locations, clustering merges/splits on zoom, tapping
  a marker shows the correct event's sheet, and changing a filter on the
  Feed tab is reflected when switching to Karte.
