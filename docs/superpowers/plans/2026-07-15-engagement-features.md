# Engagement Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement six engagement features on top of the real event feed: a better empty-radius hint, per-event calendar export, per-event sharing, a weather badge on event cards, a persisted favorites list, and local push reminders for favorited events.

**Architecture:** Pure/testable logic lives in `app/src/lib/` (ICS generation, share-text building, Open-Meteo weather lookup — same `fetchText`-injection pattern as `getEvents`/`geocode`). Platform-touching glue (file sharing, native Share sheet, local notifications) lives in `app/src/demo/` with no automated test, following this project's established convention for code that calls native/browser APIs directly. Favorites is a new Context+hook module (`favorites.tsx`) built exactly like `location.tsx`/`theme.tsx`. Tasks are ordered so nothing forward-references a module that doesn't exist yet: the reminder module (Task 5) is built before favorites (Task 6) consumes it.

**Tech Stack:** React Native / Expo (SDK 57), Jest, `@testing-library/react-native`, Open-Meteo HTTP API (no key), `expo-file-system`, `expo-sharing`, `expo-notifications` (new dependencies, installed via `npx expo install`).

## Global Constraints

- New dependencies are installed with `npx expo install <package>` (resolves SDK-57-compatible versions automatically) — never hand-edit a version string into `package.json`.
- Radius-widen step: `15000` meters per tap, capped at `100000` (the existing slider's max in `LocationOnboarding`).
- ICS `DTSTART`/`DTEND`/`DTSTAMP` format: `YYYYMMDDTHHMMSSZ` (UTC basic format). Default event duration when `event.end` is missing: start + 2 hours. Text fields (`SUMMARY`, `LOCATION`, `DESCRIPTION`) are escaped per the iCal spec: `\` → `\\`, `,` → `\,`, `;` → `\;`, newline → `\n`.
- Share message format: `"<title> — <weekday, day, month, year>, <HH:MM> in <location.name ?? "?">\n<sourceUrl>"`, built with `toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "long", year: "numeric" })` and `toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })`.
- Weather: Open-Meteo `https://api.open-meteo.com/v1/forecast?latitude=<lat>&longitude=<lon>&daily=weathercode,temperature_2m_max&timezone=auto&start_date=<YYYY-MM-DD>&end_date=<YYYY-MM-DD>`. Only fetched for events between 0 and 14 days from now (inclusive of today, exclusive beyond 14 days) — outside that window, return `null` without fetching. WMO weathercode → icon: `0` → "☀️", `1-3` → "⛅", `45`/`48` → "🌫️", `51-67` → "🌧️", `71-77` → "🌨️", `80-82` → "🌦️", `95-99` → "⛈️", anything else → "🌡️".
- Reminder lead time: 2 hours before `event.start`. Never scheduled if that moment is already in the past. Never scheduled on web (`Platform.OS === "web"` → always `null`, no permission prompt, no error). Notification content: title `"Bald geht's los!"`, body `` `${event.title} startet in 2 Stunden.` ``.
- Favorites AsyncStorage key: `demo.favorites`, stored as `Record<string, string | null>` (event ID → notification ID or `null`). Same hydration-before-persist pattern as `location.tsx` (a `hydrated` state gate on the persist effect).
- `EventPostCard`'s existing heart icon (mock "like", `liked`/`initiallyLiked` props) is untouched by every task in this plan — the new bookmark icon (🔖, real persisted favorite) is a separate, independent control.
- No automated render test is added for `EventPostCard.tsx`, `FeedScreen.tsx`, `ProfileScreen.tsx`, `DemoApp.tsx`, or any `app/src/demo/*.ts` platform-glue file that directly calls a native/browser API — this matches the established convention in this codebase (manual verification only for these).

---

### Task 1: Empty-radius hint in `FeedScreen`

**Files:**
- Modify: `app/src/demo/FeedScreen.tsx`

**Interfaces:**
- Consumes: `useLocation()`'s existing `setRadiusMeters` (already exists, just newly used by this file).
- Produces: no interface change — `FeedScreen` remains the sole export, no props.

- [ ] **Step 1: Replace the file contents**

Replace `app/src/demo/FeedScreen.tsx` with:

```tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { filterEvents } from "../lib/filterEvents";
import { getEvents } from "../lib/getEvents";
import type { EventRecord } from "../lib/types";
import { EventPostCard } from "./EventPostCard";
import { toDisplayEvent } from "./eventDisplay";
import { useLocation } from "./location";
import { useTheme } from "./theme";

const EVENTS_URL = "https://lucashaas.github.io/event-discovery-data/events.json";
const RADIUS_STEP_METERS = 15000;
const MAX_RADIUS_METERS = 100000;

export function FeedScreen() {
  const { colors } = useTheme();
  const { origin, radiusMeters, setRadiusMeters } = useLocation();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.surface },
        topbar: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
        word: { fontSize: 16, fontWeight: "800", color: colors.text },
        sub: { fontSize: 10, color: colors.textMuted, marginTop: 1 },
        empty: { alignItems: "center", padding: 32, gap: 12 },
        emptyText: { fontSize: 12, color: colors.textMuted, textAlign: "center" },
        emptyButton: { borderWidth: 1.5, borderColor: colors.accent, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10 },
        emptyButtonText: { color: colors.accent, fontWeight: "700", fontSize: 13 },
      }),
    [colors],
  );

  useEffect(() => {
    getEvents((url) => fetch(url).then((res) => res.text()), AsyncStorage, EVENTS_URL).then(setEvents);
  }, []);

  const visibleEvents = filterEvents(events, origin ? { origin, radiusMeters } : {}).map(toDisplayEvent);

  function widenRadius() {
    setRadiusMeters(Math.min(radiusMeters + RADIUS_STEP_METERS, MAX_RADIUS_METERS));
  }

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <Text style={styles.word}>Lokalfeste</Text>
        <Text style={styles.sub}>
          Alle Feste · {Math.round(radiusMeters / 1000)} km um {origin?.label ?? ""}
        </Text>
      </View>
      <FlatList
        data={visibleEvents}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <EventPostCard event={item} />}
        ListEmptyComponent={
          events.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Keine Events verfügbar — später nochmal versuchen.</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                Keine Feste im Umkreis von {Math.round(radiusMeters / 1000)} km gefunden.
              </Text>
              <Pressable style={styles.emptyButton} onPress={widenRadius}>
                <Text style={styles.emptyButtonText}>Umkreis vergrößern (+15 km)</Text>
              </Pressable>
            </View>
          )
        }
      />
    </View>
  );
}
```

- [ ] **Step 2: Verify**

Run: `cd app && npx tsc --noEmit` — no new errors beyond the known pre-existing `StyleSheet.absoluteFillObject` ones.
Run: `cd app && npx jest` — full suite still passes (this file has no direct automated test, per convention).

- [ ] **Step 3: Commit**

```bash
git add app/src/demo/FeedScreen.tsx
git commit -m "feat: show a widen-radius hint when the feed is empty"
```

---

### Task 2: Calendar export

**Files:**
- Create: `app/src/lib/ics.ts`
- Test: `app/__tests__/ics.test.ts`
- Create: `app/src/demo/calendarExport.ts`
- Modify: `app/src/demo/EventPostCard.tsx`
- Modify: `app/package.json` (+ `package-lock.json`, via `npx expo install`)

**Interfaces:**
- Produces: `buildIcsContent(event: EventRecord): string` (pure), `exportToCalendar(event: EventRecord): Promise<void>` (platform glue, no test).
- Consumes: `EventRecord` from `../lib/types` (existing).

- [ ] **Step 1: Install new dependencies**

Run: `cd app && npx expo install expo-file-system expo-sharing`
Expected: `package.json` and `package-lock.json` gain `expo-file-system` and `expo-sharing` at SDK-57-compatible versions.

- [ ] **Step 2: Write the failing tests**

Create `app/__tests__/ics.test.ts`:

```ts
import { buildIcsContent } from "../src/lib/ics";
import type { EventRecord } from "../src/lib/types";

function makeEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "1",
    title: "Weinfest",
    start: "2026-08-15T18:00:00.000Z",
    location: { name: "Marktplatz Ihringen" },
    category: "weinfest",
    sourceIds: ["a"],
    sourceUrl: "https://example.test/1",
    region: "test-region",
    lastSeenAt: "2026-07-09T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildIcsContent", () => {
  it("produces a VEVENT block with start/end and metadata", () => {
    const ics = buildIcsContent(makeEvent());
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:1@event-discovery-app");
    expect(ics).toContain("DTSTART:20260815T180000Z");
    expect(ics).toContain("DTEND:20260815T200000Z");
    expect(ics).toContain("SUMMARY:Weinfest");
    expect(ics).toContain("LOCATION:Marktplatz Ihringen");
    expect(ics).toContain("URL:https://example.test/1");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("defaults the end time to start + 2 hours when event.end is missing", () => {
    const ics = buildIcsContent(makeEvent({ start: "2026-08-15T10:00:00.000Z" }));
    expect(ics).toContain("DTSTART:20260815T100000Z");
    expect(ics).toContain("DTEND:20260815T120000Z");
  });

  it("uses event.end when present instead of the default duration", () => {
    const ics = buildIcsContent(makeEvent({ end: "2026-08-15T23:00:00.000Z" }));
    expect(ics).toContain("DTEND:20260815T230000Z");
  });

  it("escapes commas, semicolons, and backslashes in text fields", () => {
    const ics = buildIcsContent(makeEvent({ title: "Wein, Musik; Tanz \\ Spaß", description: "Line1\nLine2" }));
    expect(ics).toContain("SUMMARY:Wein\\, Musik\\; Tanz \\\\ Spaß");
    expect(ics).toContain("DESCRIPTION:Line1\\nLine2");
  });

  it("falls back to location.address when location.name is missing", () => {
    const ics = buildIcsContent(makeEvent({ location: { address: "Hauptstraße 1, Ihringen" } }));
    expect(ics).toContain("LOCATION:Hauptstraße 1\\, Ihringen");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd app && npx jest ics.test`
Expected: FAIL — `Cannot find module '../src/lib/ics'`

- [ ] **Step 4: Implement `ics.ts`**

Create `app/src/lib/ics.ts`:

```ts
import type { EventRecord } from "./types";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function toIcsDate(iso: string): string {
  const d = new Date(iso);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n");
}

export function buildIcsContent(event: EventRecord): string {
  const start = new Date(event.start);
  const end = event.end ? new Date(event.end) : new Date(start.getTime() + 2 * 3600 * 1000);
  const now = new Date();
  const location = event.location.name ?? event.location.address ?? "";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//event-discovery-app//DE",
    "BEGIN:VEVENT",
    `UID:${event.id}@event-discovery-app`,
    `DTSTAMP:${toIcsDate(now.toISOString())}`,
    `DTSTART:${toIcsDate(start.toISOString())}`,
    `DTEND:${toIcsDate(end.toISOString())}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `DESCRIPTION:${escapeIcsText(event.description ?? "")}`,
    `URL:${event.sourceUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join("\r\n");
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd app && npx jest ics.test`
Expected: PASS (5 tests)

- [ ] **Step 6: Implement `calendarExport.ts`**

Create `app/src/demo/calendarExport.ts`:

```ts
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { buildIcsContent } from "../lib/ics";
import type { EventRecord } from "../lib/types";

export async function exportToCalendar(event: EventRecord): Promise<void> {
  const content = buildIcsContent(event);

  if (Platform.OS === "web") {
    const blob = new Blob([content], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${event.id}.ics`;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }

  const file = new File(Paths.cache, `${event.id}.ics`);
  file.create({ overwrite: true });
  file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType: "text/calendar", dialogTitle: "Zum Kalender hinzufügen" });
}
```

**Note for the implementer:** `expo-file-system`'s class-based `File`/`Paths` API (SDK 54+) may differ slightly in its exact method signatures from what's shown above — after installing, run `cd app && npx tsc --noEmit` and if `File`/`Paths`/`.create()`/`.write()` don't type-check, check `node_modules/expo-file-system/build/*.d.ts` for the exact current signatures and adjust this file's native branch minimally to match (same behavior: write the ICS string to a cache file, then share its `uri`). The web branch and `ics.ts` are unaffected either way.

- [ ] **Step 7: Wire the calendar button into `EventPostCard`**

Replace `app/src/demo/EventPostCard.tsx` with:

```tsx
import { useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { exportToCalendar } from "./calendarExport";
import type { DemoEvent, DemoFriend } from "./demoData";
import { useTheme } from "./theme";

const CATEGORY_LABELS: Record<string, string> = {
  weinfest: "Weinfest",
  dorffest: "Dorffest",
  "vereins-sportfest": "Vereinssportfest",
  konzert: "Konzert",
  markt: "Markt",
  sonstiges: "Sonstiges",
};

function formatWhen(startIso: string): string {
  const start = new Date(startIso);
  const now = new Date();
  const diffMs = start.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (24 * 3600 * 1000));

  if (diffDays === 0) return `Heute · ${start.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
  if (diffDays === 1) return "Morgen";
  if (diffDays > 1 && diffDays <= 10) return `In ${diffDays} Tagen`;
  return start.toLocaleDateString("de-DE", { day: "2-digit", month: "long" });
}

interface EventPostCardProps {
  event: DemoEvent;
  likedBy?: DemoFriend[];
  initiallyLiked?: boolean;
  initiallyDabei?: boolean;
}

export function EventPostCard({ event, likedBy, initiallyLiked, initiallyDabei }: EventPostCardProps) {
  const [liked, setLiked] = useState(Boolean(initiallyLiked));
  const [dabei, setDabei] = useState(Boolean(initiallyDabei));

  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: { backgroundColor: colors.surface, borderBottomWidth: 6, borderBottomColor: colors.border },
        head: { flexDirection: "row", alignItems: "center", gap: 9, padding: 12, paddingBottom: 8 },
        seal: { width: 26, height: 26, borderRadius: 7, alignItems: "center", justifyContent: "center" },
        sealText: { color: "#fff", fontWeight: "800", fontSize: 11 },
        name: { fontSize: 12, fontWeight: "600", color: colors.text },
        time: { fontSize: 10.5, color: colors.textMuted },
        media: { aspectRatio: 1, position: "relative", overflow: "hidden" },
        tint: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(20,3,10,0.35)" },
        tag: { position: "absolute", top: 10, left: 10, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
        tagText: { color: "#fff", fontSize: 9.5, fontWeight: "700", textTransform: "uppercase" },
        mediaText: { position: "absolute", left: 14, right: 14, bottom: 12 },
        mediaTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
        mediaSub: { color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: "500", marginTop: 2 },
        actions: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 9, paddingBottom: 2 },
        heart: { fontSize: 20, color: colors.accent },
        heartActive: { color: "#b3123d" },
        actionIcon: { marginLeft: 10 },
        actionIconText: { fontSize: 18, color: colors.textMuted },
        spacer: { flex: 1 },
        dabeiBtn: { borderWidth: 1.5, borderColor: colors.accent, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4 },
        dabeiActive: { backgroundColor: colors.accent },
        dabeiText: { fontSize: 10.5, fontWeight: "700", color: colors.text },
        dabeiTextActive: { color: colors.onAccent },
        likes: { fontSize: 11.5, fontWeight: "600", paddingHorizontal: 12, paddingTop: 5, paddingBottom: 12, color: colors.text },
      }),
    [colors],
  );

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={[styles.seal, { backgroundColor: event.accent }]}>
          <Text style={styles.sealText}>{event.title.charAt(0)}</Text>
        </View>
        <View>
          <Text style={styles.name}>{event.title}</Text>
          <Text style={styles.time}>{formatWhen(event.start)}</Text>
        </View>
      </View>

      <View style={styles.media}>
        <Image source={{ uri: event.image }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        <View style={styles.tint} />
        <View style={styles.tag}>
          <Text style={styles.tagText}>{CATEGORY_LABELS[event.category] ?? event.category}</Text>
        </View>
        <View style={styles.mediaText}>
          <Text style={styles.mediaTitle}>{event.title}</Text>
          <Text style={styles.mediaSub}>{event.location.name}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable onPress={() => setLiked((v) => !v)} hitSlop={8}>
          <Text style={[styles.heart, liked && styles.heartActive]}>{liked ? "♥" : "♡"}</Text>
        </Pressable>
        <Pressable onPress={() => exportToCalendar(event)} hitSlop={8} style={styles.actionIcon}>
          <Text style={styles.actionIconText}>📅</Text>
        </Pressable>
        <View style={styles.spacer} />
        <Pressable onPress={() => setDabei((v) => !v)} hitSlop={8} style={[styles.dabeiBtn, dabei && styles.dabeiActive]}>
          <Text style={[styles.dabeiText, dabei && styles.dabeiTextActive]}>{dabei ? "Dabei ✓" : "Dabei"}</Text>
        </Pressable>
      </View>

      {likedBy && likedBy.length > 0 ? (
        <Text style={styles.likes}>
          {likedBy.map((f) => f.name).join(" und ")} {likedBy.length === 1 ? "gefällt das" : "sind dabei"}
        </Text>
      ) : (
        <Text style={styles.likes}>{event.description}</Text>
      )}
    </View>
  );
}
```

- [ ] **Step 8: Verify**

Run: `cd app && npx tsc --noEmit` — no new errors beyond the known pre-existing ones (see the implementer note in Step 6 if `expo-file-system`'s API doesn't match).
Run: `cd app && npx jest` — full suite passes, including the 5 new `ics.test.ts` cases.

- [ ] **Step 9: Commit**

```bash
git add app/src/lib/ics.ts app/__tests__/ics.test.ts app/src/demo/calendarExport.ts app/src/demo/EventPostCard.tsx app/package.json app/package-lock.json
git commit -m "feat: add per-event calendar export"
```

---

### Task 3: Event sharing

**Files:**
- Create: `app/src/lib/share.ts`
- Test: `app/__tests__/share.test.ts`
- Create: `app/src/demo/shareEvent.ts`
- Modify: `app/src/demo/EventPostCard.tsx`

**Interfaces:**
- Produces: `buildShareMessage(event: EventRecord): string` (pure), `shareEvent(event: EventRecord): Promise<void>` (platform glue, no test).
- Consumes: `EventRecord` from `../lib/types` (existing). No new dependency — uses React Native's built-in `Share` API and the browser's `navigator.share`/`navigator.clipboard`.

- [ ] **Step 1: Write the failing tests**

Create `app/__tests__/share.test.ts`:

```ts
import { buildShareMessage } from "../src/lib/share";
import type { EventRecord } from "../src/lib/types";

function makeEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "1",
    title: "Weinfest",
    start: "2026-08-15T18:00:00.000Z",
    location: { name: "Marktplatz Ihringen" },
    category: "weinfest",
    sourceIds: ["a"],
    sourceUrl: "https://example.test/1",
    region: "test-region",
    lastSeenAt: "2026-07-09T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildShareMessage", () => {
  it("includes the title, location, and source URL", () => {
    const message = buildShareMessage(makeEvent());
    expect(message).toContain("Weinfest");
    expect(message).toContain("Marktplatz Ihringen");
    expect(message).toContain("https://example.test/1");
  });

  it("falls back to a question mark when the location name is missing", () => {
    const message = buildShareMessage(makeEvent({ location: {} }));
    expect(message).toContain(" in ?\n");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx jest share.test`
Expected: FAIL — `Cannot find module '../src/lib/share'`

- [ ] **Step 3: Implement `share.ts`**

Create `app/src/lib/share.ts`:

```ts
import type { EventRecord } from "./types";

export function buildShareMessage(event: EventRecord): string {
  const start = new Date(event.start);
  const date = start.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const time = start.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const location = event.location.name ?? "?";
  return `${event.title} — ${date}, ${time} in ${location}\n${event.sourceUrl}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx jest share.test`
Expected: PASS (2 tests)

- [ ] **Step 5: Implement `shareEvent.ts`**

Create `app/src/demo/shareEvent.ts`:

```ts
import { Platform, Share } from "react-native";
import { buildShareMessage } from "../lib/share";
import type { EventRecord } from "../lib/types";

export async function shareEvent(event: EventRecord): Promise<void> {
  const message = buildShareMessage(event);

  if (Platform.OS === "web") {
    if (navigator.share) {
      await navigator.share({ title: event.title, text: message }).catch(() => {});
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(message).catch(() => {});
    }
    return;
  }

  await Share.share({ message });
}
```

- [ ] **Step 6: Add the share button to `EventPostCard`**

In `app/src/demo/EventPostCard.tsx`, add the import and the new button. The import block currently looks like this (after Task 2):

```tsx
import { useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { exportToCalendar } from "./calendarExport";
import type { DemoEvent, DemoFriend } from "./demoData";
import { useTheme } from "./theme";
```

Change it to:

```tsx
import { useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { exportToCalendar } from "./calendarExport";
import type { DemoEvent, DemoFriend } from "./demoData";
import { shareEvent } from "./shareEvent";
import { useTheme } from "./theme";
```

The actions row currently looks like this (after Task 2):

```tsx
      <View style={styles.actions}>
        <Pressable onPress={() => setLiked((v) => !v)} hitSlop={8}>
          <Text style={[styles.heart, liked && styles.heartActive]}>{liked ? "♥" : "♡"}</Text>
        </Pressable>
        <Pressable onPress={() => exportToCalendar(event)} hitSlop={8} style={styles.actionIcon}>
          <Text style={styles.actionIconText}>📅</Text>
        </Pressable>
        <View style={styles.spacer} />
```

Change it to (adds the share button between the calendar button and the spacer):

```tsx
      <View style={styles.actions}>
        <Pressable onPress={() => setLiked((v) => !v)} hitSlop={8}>
          <Text style={[styles.heart, liked && styles.heartActive]}>{liked ? "♥" : "♡"}</Text>
        </Pressable>
        <Pressable onPress={() => exportToCalendar(event)} hitSlop={8} style={styles.actionIcon}>
          <Text style={styles.actionIconText}>📅</Text>
        </Pressable>
        <Pressable onPress={() => shareEvent(event)} hitSlop={8} style={styles.actionIcon}>
          <Text style={styles.actionIconText}>📤</Text>
        </Pressable>
        <View style={styles.spacer} />
```

Everything else in the file is unchanged (no new styles needed — reuses `actionIcon`/`actionIconText` from Task 2).

- [ ] **Step 7: Verify**

Run: `cd app && npx tsc --noEmit` — no new errors.
Run: `cd app && npx jest` — full suite passes, including the 2 new `share.test.ts` cases.

- [ ] **Step 8: Commit**

```bash
git add app/src/lib/share.ts app/__tests__/share.test.ts app/src/demo/shareEvent.ts app/src/demo/EventPostCard.tsx
git commit -m "feat: add per-event sharing"
```

---

### Task 4: Weather badge

**Files:**
- Create: `app/src/lib/weather.ts`
- Test: `app/__tests__/weather.test.ts`
- Modify: `app/src/demo/EventPostCard.tsx`

**Interfaces:**
- Produces: `WeatherInfo` (type: `{ code: number; maxTempC: number; icon: string }`), `getWeather(lat: number, lon: number, dateIso: string, fetchText: (url: string) => Promise<string>): Promise<WeatherInfo | null>` (pure).
- Consumes: nothing new from earlier tasks — standalone module.

- [ ] **Step 1: Write the failing tests**

Create `app/__tests__/weather.test.ts`:

```ts
import { getWeather } from "../src/lib/weather";

function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
}

const FORECAST_RESPONSE = JSON.stringify({
  daily: { weathercode: [0], temperature_2m_max: [24.3] },
});
const EMPTY_RESPONSE = JSON.stringify({ daily: { weathercode: [], temperature_2m_max: [] } });

describe("getWeather", () => {
  it("returns weather info with a mapped icon for a near-future date", async () => {
    const fetchText = jest.fn().mockResolvedValue(FORECAST_RESPONSE);
    const result = await getWeather(48.03, 7.65, isoDaysFromNow(3), fetchText);
    expect(result).toEqual({ code: 0, maxTempC: 24.3, icon: "☀️" });
    expect(fetchText).toHaveBeenCalledWith(expect.stringContaining("api.open-meteo.com/v1/forecast"));
  });

  it("does not fetch and returns null for a date more than 14 days out", async () => {
    const fetchText = jest.fn();
    const result = await getWeather(48.03, 7.65, isoDaysFromNow(20), fetchText);
    expect(result).toBeNull();
    expect(fetchText).not.toHaveBeenCalled();
  });

  it("does not fetch and returns null for a date in the past", async () => {
    const fetchText = jest.fn();
    const result = await getWeather(48.03, 7.65, isoDaysFromNow(-1), fetchText);
    expect(result).toBeNull();
    expect(fetchText).not.toHaveBeenCalled();
  });

  it("returns null when the response has no daily data", async () => {
    const fetchText = jest.fn().mockResolvedValue(EMPTY_RESPONSE);
    const result = await getWeather(48.03, 7.65, isoDaysFromNow(3), fetchText);
    expect(result).toBeNull();
  });

  it("maps a rain weathercode to the rain icon", async () => {
    const fetchText = jest
      .fn()
      .mockResolvedValue(JSON.stringify({ daily: { weathercode: [61], temperature_2m_max: [17] } }));
    const result = await getWeather(48.03, 7.65, isoDaysFromNow(1), fetchText);
    expect(result?.icon).toBe("🌧️");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx jest weather.test`
Expected: FAIL — `Cannot find module '../src/lib/weather'`

- [ ] **Step 3: Implement `weather.ts`**

Create `app/src/lib/weather.ts`:

```ts
export interface WeatherInfo {
  code: number;
  maxTempC: number;
  icon: string;
}

const FORECAST_HORIZON_DAYS = 14;

function iconForCode(code: number): string {
  if (code === 0) return "☀️";
  if (code >= 1 && code <= 3) return "⛅";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 51 && code <= 67) return "🌧️";
  if (code >= 71 && code <= 77) return "🌨️";
  if (code >= 80 && code <= 82) return "🌦️";
  if (code >= 95 && code <= 99) return "⛈️";
  return "🌡️";
}

export async function getWeather(
  lat: number,
  lon: number,
  dateIso: string,
  fetchText: (url: string) => Promise<string>,
): Promise<WeatherInfo | null> {
  const date = new Date(dateIso);
  const daysAhead = Math.floor((date.getTime() - Date.now()) / (24 * 3600 * 1000));
  if (daysAhead < 0 || daysAhead > FORECAST_HORIZON_DAYS) return null;

  const dateStr = date.toISOString().slice(0, 10);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max&timezone=auto&start_date=${dateStr}&end_date=${dateStr}`;
  const text = await fetchText(url);
  const data = JSON.parse(text) as { daily?: { weathercode?: number[]; temperature_2m_max?: number[] } };

  const code = data.daily?.weathercode?.[0];
  const maxTempC = data.daily?.temperature_2m_max?.[0];
  if (typeof code !== "number" || typeof maxTempC !== "number") return null;

  return { code, maxTempC, icon: iconForCode(code) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx jest weather.test`
Expected: PASS (5 tests)

- [ ] **Step 5: Wire the weather badge into `EventPostCard`**

Replace `app/src/demo/EventPostCard.tsx` with:

```tsx
import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { getWeather, type WeatherInfo } from "../lib/weather";
import { exportToCalendar } from "./calendarExport";
import type { DemoEvent, DemoFriend } from "./demoData";
import { shareEvent } from "./shareEvent";
import { useTheme } from "./theme";

const CATEGORY_LABELS: Record<string, string> = {
  weinfest: "Weinfest",
  dorffest: "Dorffest",
  "vereins-sportfest": "Vereinssportfest",
  konzert: "Konzert",
  markt: "Markt",
  sonstiges: "Sonstiges",
};

function formatWhen(startIso: string): string {
  const start = new Date(startIso);
  const now = new Date();
  const diffMs = start.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (24 * 3600 * 1000));

  if (diffDays === 0) return `Heute · ${start.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
  if (diffDays === 1) return "Morgen";
  if (diffDays > 1 && diffDays <= 10) return `In ${diffDays} Tagen`;
  return start.toLocaleDateString("de-DE", { day: "2-digit", month: "long" });
}

interface EventPostCardProps {
  event: DemoEvent;
  likedBy?: DemoFriend[];
  initiallyLiked?: boolean;
  initiallyDabei?: boolean;
}

export function EventPostCard({ event, likedBy, initiallyLiked, initiallyDabei }: EventPostCardProps) {
  const [liked, setLiked] = useState(Boolean(initiallyLiked));
  const [dabei, setDabei] = useState(Boolean(initiallyDabei));
  const [weather, setWeather] = useState<WeatherInfo | null>(null);

  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: { backgroundColor: colors.surface, borderBottomWidth: 6, borderBottomColor: colors.border },
        head: { flexDirection: "row", alignItems: "center", gap: 9, padding: 12, paddingBottom: 8 },
        seal: { width: 26, height: 26, borderRadius: 7, alignItems: "center", justifyContent: "center" },
        sealText: { color: "#fff", fontWeight: "800", fontSize: 11 },
        name: { fontSize: 12, fontWeight: "600", color: colors.text },
        time: { fontSize: 10.5, color: colors.textMuted },
        media: { aspectRatio: 1, position: "relative", overflow: "hidden" },
        tint: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(20,3,10,0.35)" },
        tag: { position: "absolute", top: 10, left: 10, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
        tagText: { color: "#fff", fontSize: 9.5, fontWeight: "700", textTransform: "uppercase" },
        weatherTag: { position: "absolute", top: 10, right: 10, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
        weatherTagText: { color: "#fff", fontSize: 11, fontWeight: "700" },
        mediaText: { position: "absolute", left: 14, right: 14, bottom: 12 },
        mediaTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
        mediaSub: { color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: "500", marginTop: 2 },
        actions: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 9, paddingBottom: 2 },
        heart: { fontSize: 20, color: colors.accent },
        heartActive: { color: "#b3123d" },
        actionIcon: { marginLeft: 10 },
        actionIconText: { fontSize: 18, color: colors.textMuted },
        spacer: { flex: 1 },
        dabeiBtn: { borderWidth: 1.5, borderColor: colors.accent, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4 },
        dabeiActive: { backgroundColor: colors.accent },
        dabeiText: { fontSize: 10.5, fontWeight: "700", color: colors.text },
        dabeiTextActive: { color: colors.onAccent },
        likes: { fontSize: 11.5, fontWeight: "600", paddingHorizontal: 12, paddingTop: 5, paddingBottom: 12, color: colors.text },
      }),
    [colors],
  );

  useEffect(() => {
    const { lat, lon } = event.location;
    if (typeof lat !== "number" || typeof lon !== "number") return;
    getWeather(lat, lon, event.start, (url) => fetch(url).then((res) => res.text())).then(setWeather);
  }, [event.location.lat, event.location.lon, event.start]);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={[styles.seal, { backgroundColor: event.accent }]}>
          <Text style={styles.sealText}>{event.title.charAt(0)}</Text>
        </View>
        <View>
          <Text style={styles.name}>{event.title}</Text>
          <Text style={styles.time}>{formatWhen(event.start)}</Text>
        </View>
      </View>

      <View style={styles.media}>
        <Image source={{ uri: event.image }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        <View style={styles.tint} />
        <View style={styles.tag}>
          <Text style={styles.tagText}>{CATEGORY_LABELS[event.category] ?? event.category}</Text>
        </View>
        {weather ? (
          <View style={styles.weatherTag}>
            <Text style={styles.weatherTagText}>
              {weather.icon} {Math.round(weather.maxTempC)}°
            </Text>
          </View>
        ) : null}
        <View style={styles.mediaText}>
          <Text style={styles.mediaTitle}>{event.title}</Text>
          <Text style={styles.mediaSub}>{event.location.name}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable onPress={() => setLiked((v) => !v)} hitSlop={8}>
          <Text style={[styles.heart, liked && styles.heartActive]}>{liked ? "♥" : "♡"}</Text>
        </Pressable>
        <Pressable onPress={() => exportToCalendar(event)} hitSlop={8} style={styles.actionIcon}>
          <Text style={styles.actionIconText}>📅</Text>
        </Pressable>
        <Pressable onPress={() => shareEvent(event)} hitSlop={8} style={styles.actionIcon}>
          <Text style={styles.actionIconText}>📤</Text>
        </Pressable>
        <View style={styles.spacer} />
        <Pressable onPress={() => setDabei((v) => !v)} hitSlop={8} style={[styles.dabeiBtn, dabei && styles.dabeiActive]}>
          <Text style={[styles.dabeiText, dabei && styles.dabeiTextActive]}>{dabei ? "Dabei ✓" : "Dabei"}</Text>
        </Pressable>
      </View>

      {likedBy && likedBy.length > 0 ? (
        <Text style={styles.likes}>
          {likedBy.map((f) => f.name).join(" und ")} {likedBy.length === 1 ? "gefällt das" : "sind dabei"}
        </Text>
      ) : (
        <Text style={styles.likes}>{event.description}</Text>
      )}
    </View>
  );
}
```

- [ ] **Step 6: Verify**

Run: `cd app && npx tsc --noEmit` — no new errors.
Run: `cd app && npx jest` — full suite passes, including the 5 new `weather.test.ts` cases.

- [ ] **Step 7: Commit**

```bash
git add app/src/lib/weather.ts app/__tests__/weather.test.ts app/src/demo/EventPostCard.tsx
git commit -m "feat: show a weather badge on event cards"
```

---

### Task 5: Reminder scheduling module

**Files:**
- Create: `app/src/demo/reminders.ts`
- Modify: `app/package.json` (+ `package-lock.json`, via `npx expo install`)

**Interfaces:**
- Produces: `scheduleReminder(event: EventRecord): Promise<string | null>`, `cancelReminder(notificationId: string): Promise<void>`. No automated test (platform glue around `expo-notifications`, same convention as `calendarExport.ts`/`shareEvent.ts`).
- Consumes: `EventRecord` from `../lib/types` (existing). Not consumed by anything yet in this task — Task 6 wires it into `favorites.tsx`.

- [ ] **Step 1: Install the new dependency**

Run: `cd app && npx expo install expo-notifications`
Expected: `package.json` and `package-lock.json` gain `expo-notifications` at an SDK-57-compatible version.

- [ ] **Step 2: Implement `reminders.ts`**

Create `app/src/demo/reminders.ts`:

```ts
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { EventRecord } from "../lib/types";

const REMINDER_LEAD_MS = 2 * 3600 * 1000;

export async function scheduleReminder(event: EventRecord): Promise<string | null> {
  if (Platform.OS === "web") return null;

  const triggerTime = new Date(event.start).getTime() - REMINDER_LEAD_MS;
  if (triggerTime <= Date.now()) return null;

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return null;

  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Bald geht's los!",
      body: `${event.title} startet in 2 Stunden.`,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(triggerTime),
    },
  });
}

export async function cancelReminder(notificationId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}
```

**Note for the implementer:** if `Notifications.SchedulableTriggerInputTypes` doesn't exist in the installed version's types, check `node_modules/expo-notifications/build/*.d.ts` for the current trigger shape and adjust `scheduleReminder`'s `trigger` object minimally to match (same behavior: fire once at `triggerTime`).

- [ ] **Step 3: Verify**

Run: `cd app && npx tsc --noEmit` — no new errors (see the implementer note in Step 2 if the trigger type doesn't match).
Run: `cd app && npx jest` — full suite passes (no new tests in this task).

- [ ] **Step 4: Commit**

```bash
git add app/src/demo/reminders.ts app/package.json app/package-lock.json
git commit -m "feat: add local reminder scheduling module"
```

---

### Task 6: Favorites

**Files:**
- Create: `app/src/demo/favorites.tsx`
- Test: `app/__tests__/favorites.test.tsx`
- Modify: `app/src/demo/DemoApp.tsx`
- Modify: `app/src/demo/EventPostCard.tsx`
- Modify: `app/src/demo/ProfileScreen.tsx`
- Modify: `app/__tests__/ProfileScreen.test.tsx`

**Interfaces:**
- Consumes: `scheduleReminder`, `cancelReminder` (Task 5).
- Produces: `FavoritesProvider({ children }: { children: ReactNode })`, `useFavorites(): { isFavorite(id: string): boolean; toggleFavorite(event: EventRecord): void }`.

- [ ] **Step 1: Write the failing tests**

Create `app/__tests__/favorites.test.tsx`:

```tsx
import { Pressable, Text } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FavoritesProvider, useFavorites } from "../src/demo/favorites";
import { cancelReminder, scheduleReminder } from "../src/demo/reminders";
import type { EventRecord } from "../src/lib/types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("../src/demo/reminders", () => ({
  scheduleReminder: jest.fn(),
  cancelReminder: jest.fn(),
}));

const EVENT: EventRecord = {
  id: "1",
  title: "Weinfest",
  start: "2026-08-15T18:00:00.000Z",
  location: { name: "Marktplatz" },
  category: "weinfest",
  sourceIds: ["a"],
  sourceUrl: "https://example.test/1",
  region: "test-region",
  lastSeenAt: "2026-07-09T00:00:00.000Z",
};

function Probe() {
  const { isFavorite, toggleFavorite } = useFavorites();
  return (
    <>
      <Text>{isFavorite(EVENT.id) ? "fav:true" : "fav:false"}</Text>
      <Pressable onPress={() => toggleFavorite(EVENT)}>
        <Text>toggle</Text>
      </Pressable>
    </>
  );
}

describe("FavoritesProvider", () => {
  beforeEach(() => {
    (scheduleReminder as jest.Mock).mockReset().mockResolvedValue("notif-1");
    (cancelReminder as jest.Mock).mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await AsyncStorage.clear();
  });

  it("defaults to not favorited", async () => {
    await render(
      <FavoritesProvider>
        <Probe />
      </FavoritesProvider>,
    );
    expect(await screen.findByText("fav:false")).toBeTruthy();
  });

  it("toggling on marks it favorited, schedules a reminder, and persists it", async () => {
    await render(
      <FavoritesProvider>
        <Probe />
      </FavoritesProvider>,
    );
    fireEvent.press(await screen.findByText("toggle"));
    expect(await screen.findByText("fav:true")).toBeTruthy();
    expect(scheduleReminder).toHaveBeenCalledWith(EVENT);

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem("demo.favorites")) ?? "{}");
      expect(stored).toEqual({ "1": "notif-1" });
    });
  });

  it("toggling off removes it, cancels the reminder, and persists the removal", async () => {
    await render(
      <FavoritesProvider>
        <Probe />
      </FavoritesProvider>,
    );
    fireEvent.press(await screen.findByText("toggle"));
    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem("demo.favorites")) ?? "{}");
      expect(stored["1"]).toBe("notif-1");
    });

    fireEvent.press(await screen.findByText("toggle"));
    expect(await screen.findByText("fav:false")).toBeTruthy();
    expect(cancelReminder).toHaveBeenCalledWith("notif-1");

    const stored = JSON.parse((await AsyncStorage.getItem("demo.favorites"))!);
    expect(stored).toEqual({});
  });

  it("loads a persisted favorite on mount", async () => {
    await AsyncStorage.setItem("demo.favorites", JSON.stringify({ "1": "notif-old" }));
    await render(
      <FavoritesProvider>
        <Probe />
      </FavoritesProvider>,
    );
    expect(await screen.findByText("fav:true")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx jest favorites.test`
Expected: FAIL — `Cannot find module '../src/demo/favorites'`

- [ ] **Step 3: Implement `favorites.tsx`**

Create `app/src/demo/favorites.tsx`:

```tsx
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx jest favorites.test`
Expected: PASS (4 tests)

- [ ] **Step 5: Wrap `DemoApp` in `FavoritesProvider`**

In `app/src/demo/DemoApp.tsx`, the top-level component currently looks like this:

```tsx
export function DemoApp() {
  return (
    <ThemeProvider>
      <LocationProvider>
        <DemoAppContent />
      </LocationProvider>
    </ThemeProvider>
  );
}
```

Change it to:

```tsx
export function DemoApp() {
  return (
    <ThemeProvider>
      <LocationProvider>
        <FavoritesProvider>
          <DemoAppContent />
        </FavoritesProvider>
      </LocationProvider>
    </ThemeProvider>
  );
}
```

And add the import alongside the existing `location` import at the top of the file:

```tsx
import { FavoritesProvider } from "./favorites";
```

(Add it in the existing import block, keeping the block alphabetically ordered as it already is — it goes right after the `FeedScreen`/`FriendsFeedScreen` imports and before `LocationOnboarding`.)

- [ ] **Step 6: Add the favorite button to `EventPostCard`**

Replace `app/src/demo/EventPostCard.tsx` with:

```tsx
import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { getWeather, type WeatherInfo } from "../lib/weather";
import { exportToCalendar } from "./calendarExport";
import type { DemoEvent, DemoFriend } from "./demoData";
import { useFavorites } from "./favorites";
import { shareEvent } from "./shareEvent";
import { useTheme } from "./theme";

const CATEGORY_LABELS: Record<string, string> = {
  weinfest: "Weinfest",
  dorffest: "Dorffest",
  "vereins-sportfest": "Vereinssportfest",
  konzert: "Konzert",
  markt: "Markt",
  sonstiges: "Sonstiges",
};

function formatWhen(startIso: string): string {
  const start = new Date(startIso);
  const now = new Date();
  const diffMs = start.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (24 * 3600 * 1000));

  if (diffDays === 0) return `Heute · ${start.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
  if (diffDays === 1) return "Morgen";
  if (diffDays > 1 && diffDays <= 10) return `In ${diffDays} Tagen`;
  return start.toLocaleDateString("de-DE", { day: "2-digit", month: "long" });
}

interface EventPostCardProps {
  event: DemoEvent;
  likedBy?: DemoFriend[];
  initiallyLiked?: boolean;
  initiallyDabei?: boolean;
}

export function EventPostCard({ event, likedBy, initiallyLiked, initiallyDabei }: EventPostCardProps) {
  const [liked, setLiked] = useState(Boolean(initiallyLiked));
  const [dabei, setDabei] = useState(Boolean(initiallyDabei));
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const { isFavorite, toggleFavorite } = useFavorites();
  const favorited = isFavorite(event.id);

  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: { backgroundColor: colors.surface, borderBottomWidth: 6, borderBottomColor: colors.border },
        head: { flexDirection: "row", alignItems: "center", gap: 9, padding: 12, paddingBottom: 8 },
        seal: { width: 26, height: 26, borderRadius: 7, alignItems: "center", justifyContent: "center" },
        sealText: { color: "#fff", fontWeight: "800", fontSize: 11 },
        name: { fontSize: 12, fontWeight: "600", color: colors.text },
        time: { fontSize: 10.5, color: colors.textMuted },
        media: { aspectRatio: 1, position: "relative", overflow: "hidden" },
        tint: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(20,3,10,0.35)" },
        tag: { position: "absolute", top: 10, left: 10, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
        tagText: { color: "#fff", fontSize: 9.5, fontWeight: "700", textTransform: "uppercase" },
        weatherTag: { position: "absolute", top: 10, right: 10, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
        weatherTagText: { color: "#fff", fontSize: 11, fontWeight: "700" },
        mediaText: { position: "absolute", left: 14, right: 14, bottom: 12 },
        mediaTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
        mediaSub: { color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: "500", marginTop: 2 },
        actions: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 9, paddingBottom: 2 },
        heart: { fontSize: 20, color: colors.accent },
        heartActive: { color: "#b3123d" },
        actionIcon: { marginLeft: 10 },
        actionIconText: { fontSize: 18, color: colors.textMuted },
        actionIconActive: { color: colors.accent },
        spacer: { flex: 1 },
        dabeiBtn: { borderWidth: 1.5, borderColor: colors.accent, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4 },
        dabeiActive: { backgroundColor: colors.accent },
        dabeiText: { fontSize: 10.5, fontWeight: "700", color: colors.text },
        dabeiTextActive: { color: colors.onAccent },
        likes: { fontSize: 11.5, fontWeight: "600", paddingHorizontal: 12, paddingTop: 5, paddingBottom: 12, color: colors.text },
      }),
    [colors],
  );

  useEffect(() => {
    const { lat, lon } = event.location;
    if (typeof lat !== "number" || typeof lon !== "number") return;
    getWeather(lat, lon, event.start, (url) => fetch(url).then((res) => res.text())).then(setWeather);
  }, [event.location.lat, event.location.lon, event.start]);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={[styles.seal, { backgroundColor: event.accent }]}>
          <Text style={styles.sealText}>{event.title.charAt(0)}</Text>
        </View>
        <View>
          <Text style={styles.name}>{event.title}</Text>
          <Text style={styles.time}>{formatWhen(event.start)}</Text>
        </View>
      </View>

      <View style={styles.media}>
        <Image source={{ uri: event.image }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        <View style={styles.tint} />
        <View style={styles.tag}>
          <Text style={styles.tagText}>{CATEGORY_LABELS[event.category] ?? event.category}</Text>
        </View>
        {weather ? (
          <View style={styles.weatherTag}>
            <Text style={styles.weatherTagText}>
              {weather.icon} {Math.round(weather.maxTempC)}°
            </Text>
          </View>
        ) : null}
        <View style={styles.mediaText}>
          <Text style={styles.mediaTitle}>{event.title}</Text>
          <Text style={styles.mediaSub}>{event.location.name}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable onPress={() => setLiked((v) => !v)} hitSlop={8}>
          <Text style={[styles.heart, liked && styles.heartActive]}>{liked ? "♥" : "♡"}</Text>
        </Pressable>
        <Pressable onPress={() => toggleFavorite(event)} hitSlop={8} style={styles.actionIcon}>
          <Text style={[styles.actionIconText, favorited && styles.actionIconActive]}>🔖</Text>
        </Pressable>
        <Pressable onPress={() => exportToCalendar(event)} hitSlop={8} style={styles.actionIcon}>
          <Text style={styles.actionIconText}>📅</Text>
        </Pressable>
        <Pressable onPress={() => shareEvent(event)} hitSlop={8} style={styles.actionIcon}>
          <Text style={styles.actionIconText}>📤</Text>
        </Pressable>
        <View style={styles.spacer} />
        <Pressable onPress={() => setDabei((v) => !v)} hitSlop={8} style={[styles.dabeiBtn, dabei && styles.dabeiActive]}>
          <Text style={[styles.dabeiText, dabei && styles.dabeiTextActive]}>{dabei ? "Dabei ✓" : "Dabei"}</Text>
        </Pressable>
      </View>

      {likedBy && likedBy.length > 0 ? (
        <Text style={styles.likes}>
          {likedBy.map((f) => f.name).join(" und ")} {likedBy.length === 1 ? "gefällt das" : "sind dabei"}
        </Text>
      ) : (
        <Text style={styles.likes}>{event.description}</Text>
      )}
    </View>
  );
}
```

- [ ] **Step 7: Add the "Meine Favoriten" section to `ProfileScreen`**

Replace `app/src/demo/ProfileScreen.tsx` with:

```tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { getEvents } from "../lib/getEvents";
import type { EventRecord } from "../lib/types";
import { demoEvents, demoFriends } from "./demoData";
import { EventPostCard } from "./EventPostCard";
import { LocationOnboarding } from "./LocationOnboarding";
import { toDisplayEvent } from "./eventDisplay";
import { useFavorites } from "./favorites";
import { useLocation } from "./location";
import { useTheme } from "./theme";

const EVENTS_URL = "https://lucashaas.github.io/event-discovery-data/events.json";
const INERT_SETTINGS = ["Benachrichtigungen", "Über die App"];

export function ProfileScreen() {
  const { colors, isDark, toggle } = useTheme();
  const { origin, radiusMeters } = useLocation();
  const { isFavorite } = useFavorites();
  const [editingLocation, setEditingLocation] = useState(false);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.surface },
        topbar: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
        word: { fontSize: 16, fontWeight: "800", color: colors.text },
        head: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
        avatar: { width: 52, height: 52, borderRadius: 14, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
        avatarText: { color: colors.onAccent, fontWeight: "800", fontSize: 19 },
        name: { fontSize: 15, fontWeight: "700", color: colors.text },
        loc: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
        stats: { flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
        stat: { flex: 1, alignItems: "center", paddingVertical: 10 },
        statNum: { fontSize: 15, fontWeight: "800", color: colors.text },
        statLabel: { fontSize: 9.5, color: colors.textMuted, textTransform: "uppercase" },
        sectionTitle: { fontSize: 10.5, fontWeight: "700", textTransform: "uppercase", color: colors.textMuted, padding: 14, paddingBottom: 6 },
        item: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
        itemLabel: { fontSize: 12, color: colors.text },
        itemChevron: { color: colors.textMuted },
        emptyFavorites: { fontSize: 12, color: colors.textMuted, paddingHorizontal: 16, paddingBottom: 16 },
      }),
    [colors],
  );

  useEffect(() => {
    getEvents((url) => fetch(url).then((res) => res.text()), AsyncStorage, EVENTS_URL).then(setEvents);
  }, []);

  if (editingLocation) {
    return <LocationOnboarding showRadiusSlider onDone={() => setEditingLocation(false)} />;
  }

  const favoriteEvents = events.filter((event) => isFavorite(event.id));

  return (
    <ScrollView style={styles.container}>
      <View style={styles.topbar}>
        <Text style={styles.word}>Profil</Text>
      </View>

      <View style={styles.head}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>L</Text>
        </View>
        <View>
          <Text style={styles.name}>Lucas</Text>
          <Text style={styles.loc}>
            Standort: {origin?.label ?? "Nicht gesetzt"} · {Math.round(radiusMeters / 1000)} km Umkreis
          </Text>
        </View>
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}><Text style={styles.statNum}>12</Text><Text style={styles.statLabel}>Besucht</Text></View>
        <View style={styles.stat}><Text style={styles.statNum}>{demoFriends.length}</Text><Text style={styles.statLabel}>Freunde</Text></View>
        <View style={styles.stat}><Text style={styles.statNum}>{demoEvents.length}</Text><Text style={styles.statLabel}>Geplant</Text></View>
      </View>

      <Text style={styles.sectionTitle}>Einstellungen</Text>
      <Pressable style={styles.item} onPress={() => setEditingLocation(true)}>
        <Text style={styles.itemLabel}>Standort ändern</Text>
        <Text style={styles.itemChevron}>›</Text>
      </Pressable>
      {INERT_SETTINGS.map((label) => (
        <View key={label} style={styles.item}>
          <Text style={styles.itemLabel}>{label}</Text>
          <Text style={styles.itemChevron}>›</Text>
        </View>
      ))}
      <View style={styles.item}>
        <Text style={styles.itemLabel}>Dark Mode</Text>
        <Switch value={isDark} onValueChange={toggle} />
      </View>

      <Text style={styles.sectionTitle}>Meine Favoriten</Text>
      {favoriteEvents.length === 0 ? (
        <Text style={styles.emptyFavorites}>Noch keine Favoriten — tippe 🔖 auf einem Fest.</Text>
      ) : (
        favoriteEvents.map((event) => <EventPostCard key={event.id} event={toDisplayEvent(event)} />)
      )}
    </ScrollView>
  );
}
```

- [ ] **Step 8: Update `ProfileScreen.test.tsx` to add the now-required `FavoritesProvider`**

`ProfileScreen` now calls `useFavorites()`, so the existing test throws "useFavorites must be used within a FavoritesProvider" unless wrapped. Replace `app/__tests__/ProfileScreen.test.tsx`'s full contents with:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { FavoritesProvider } from "../src/demo/favorites";
import { LocationProvider } from "../src/demo/location";
import { ProfileScreen } from "../src/demo/ProfileScreen";
import { ThemeProvider } from "../src/demo/theme";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

describe("ProfileScreen dark mode toggle", () => {
  it("renders a Dark Mode switch that starts off", async () => {
    await render(
      <ThemeProvider>
        <LocationProvider>
          <FavoritesProvider>
            <ProfileScreen />
          </FavoritesProvider>
        </LocationProvider>
      </ThemeProvider>,
    );
    const toggle = await screen.findByRole("switch");
    expect(toggle.props.value).toBe(false);
  });

  it("flips on press", async () => {
    await render(
      <ThemeProvider>
        <LocationProvider>
          <FavoritesProvider>
            <ProfileScreen />
          </FavoritesProvider>
        </LocationProvider>
      </ThemeProvider>,
    );
    const toggle = await screen.findByRole("switch");
    fireEvent(toggle, "valueChange", true);
    expect((await screen.findByRole("switch")).props.value).toBe(true);
  });
});
```

This is a mechanical update (adding one wrapper component), not a new RED/GREEN cycle — assertions are unchanged.

- [ ] **Step 9: Run the full test suite and verify it passes**

Run: `cd app && npx jest`
Expected: PASS — all suites, including the 4 new `favorites.test.tsx` cases and the updated `ProfileScreen.test.tsx`.
Run: `cd app && npx tsc --noEmit` — no new errors beyond the known pre-existing ones.

- [ ] **Step 10: Manual verification**

Run: `cd app && npm run web` (skip if already running). Go to Feed, tap 🔖 on an event card — icon should turn accent-colored. Go to Profil — the same event should appear under "Meine Favoriten". Tap 🔖 again on either copy of the card — it should disappear from Profil's favorites section. Tap 📅 on a card — on web, a `.ics` file should download. Tap 📤 — on web (if `navigator.share` isn't available in the test browser), no visible error should occur (silent clipboard fallback). If an event has a location with real coordinates and a date within 14 days, a weather badge should appear in the top-right of its image within a second or two of the card mounting.

- [ ] **Step 11: Commit**

```bash
git add app/src/demo/favorites.tsx app/__tests__/favorites.test.tsx app/src/demo/DemoApp.tsx app/src/demo/EventPostCard.tsx app/src/demo/ProfileScreen.tsx app/__tests__/ProfileScreen.test.tsx
git commit -m "feat: add persisted favorites with reminder scheduling"
```

---

## Full Test Suite Check

After Task 6, run the complete suite once more to confirm nothing else broke:

Run: `cd app && npx jest`
Expected: all suites PASS, including every pre-existing suite plus `ics.test.ts`, `share.test.ts`, `weather.test.ts`, `favorites.test.tsx`, and the updated `ProfileScreen.test.tsx`.
Run: `cd app && npx tsc --noEmit`
Expected: no new errors beyond the 3 known pre-existing `StyleSheet.absoluteFillObject` ones.
