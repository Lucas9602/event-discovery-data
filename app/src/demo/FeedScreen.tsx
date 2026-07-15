import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { zeitraumToDateRange, type ZeitraumOption } from "../lib/dateRange";
import { filterEvents } from "../lib/filterEvents";
import { getEvents } from "../lib/getEvents";
import type { EventRecord } from "../lib/types";
import { EventPostCard } from "./EventPostCard";
import { toDisplayEvent } from "./eventDisplay";
import { FilterChips, type ChipOption } from "./FilterChips";
import { useLocation } from "./location";
import { useTheme } from "./theme";

const EVENTS_URL = "https://lucas9602.github.io/event-discovery-data/events.json";
const RADIUS_STEP_METERS = 15000;
const MAX_RADIUS_METERS = 100000;

const CATEGORY_OPTIONS: ChipOption[] = [
  { value: "alle", label: "Alle" },
  { value: "weinfest", label: "Weinfest" },
  { value: "dorffest", label: "Dorffest & Feste" },
  { value: "konzert", label: "Konzert" },
  { value: "markt", label: "Markt" },
  { value: "fuehrung-tour", label: "Führung & Tour" },
  { value: "vereinsleben", label: "Vereinsleben" },
  { value: "geselligkeit", label: "Geselligkeit" },
  { value: "kultur", label: "Kultur" },
  { value: "sonstiges", label: "Sonstiges" },
];

const ZEITRAUM_OPTIONS: ChipOption[] = [
  { value: "alle", label: "Alle" },
  { value: "diese-woche", label: "Diese Woche" },
  { value: "dieser-monat", label: "Dieser Monat" },
  { value: "zeitraum", label: "Zeitraum wählen" },
];

function toStartOfDayIso(dateText: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return undefined;
  return new Date(`${dateText}T00:00:00.000Z`).toISOString();
}

function toEndOfDayIso(dateText: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return undefined;
  return new Date(`${dateText}T23:59:59.999Z`).toISOString();
}

export function FeedScreen() {
  const { colors } = useTheme();
  const { origin, radiusMeters, setRadiusMeters } = useLocation();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState("alle");
  const [zeitraum, setZeitraum] = useState<ZeitraumOption>("alle");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.surface },
        topbar: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
        word: { fontSize: 16, fontWeight: "800", color: colors.text },
        sub: { fontSize: 10, color: colors.textMuted, marginTop: 1 },
        customDateRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
        customDateInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, color: colors.text },
        empty: { alignItems: "center", padding: 32, gap: 12 },
        emptyText: { fontSize: 12, color: colors.textMuted, textAlign: "center" },
        emptyButton: { borderWidth: 1.5, borderColor: colors.accent, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10 },
        emptyButtonText: { color: colors.accent, fontWeight: "700", fontSize: 13 },
      }),
    [colors],
  );

  const loadEvents = useCallback(() => {
    return getEvents((url) => fetch(url).then((res) => res.text()), AsyncStorage, EVENTS_URL).then(setEvents);
  }, []);

  useEffect(() => {
    loadEvents().finally(() => setLoading(false));
  }, [loadEvents]);

  function onRefresh() {
    setRefreshing(true);
    loadEvents().finally(() => setRefreshing(false));
  }

  const presetRange = zeitraumToDateRange(zeitraum, new Date());
  const dateFrom = zeitraum === "zeitraum" ? toStartOfDayIso(customFrom) : presetRange.dateFrom;
  const dateTo = zeitraum === "zeitraum" ? toEndOfDayIso(customTo) : presetRange.dateTo;

  const visibleEvents = filterEvents(events, {
    ...(origin ? { origin, radiusMeters } : {}),
    ...(category !== "alle" ? { category } : {}),
    dateFrom,
    dateTo,
  }).map(toDisplayEvent);

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
      <FilterChips options={CATEGORY_OPTIONS} selected={category} onSelect={setCategory} />
      <FilterChips
        options={ZEITRAUM_OPTIONS}
        selected={zeitraum}
        onSelect={(value) => setZeitraum(value as ZeitraumOption)}
      />
      {zeitraum === "zeitraum" ? (
        <View style={styles.customDateRow}>
          <TextInput
            placeholder="Von (JJJJ-MM-TT)"
            placeholderTextColor={colors.textMuted}
            value={customFrom}
            onChangeText={setCustomFrom}
            style={styles.customDateInput}
          />
          <TextInput
            placeholder="Bis (JJJJ-MM-TT)"
            placeholderTextColor={colors.textMuted}
            value={customTo}
            onChangeText={setCustomTo}
            style={styles.customDateInput}
          />
        </View>
      ) : null}
      <FlatList
        data={visibleEvents}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <EventPostCard event={item} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : events.length === 0 ? (
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
