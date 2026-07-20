import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { toEndOfDayIso, toStartOfDayIso, zeitraumToDateRange, type ZeitraumOption } from "../lib/dateRange";
import { filterEvents } from "../lib/filterEvents";
import { getEvents } from "../lib/getEvents";
import type { EventRecord } from "../lib/types";
import { EventPostCard } from "./EventPostCard";
import { toDisplayEvent } from "./eventDisplay";
import { FilterChips, type ChipOption } from "./FilterChips";
import { MultiFilterChips } from "./MultiFilterChips";
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

export function FeedScreen() {
  const { colors } = useTheme();
  const { origin, radiusMeters, setRadiusMeters } = useLocation();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [zeitraum, setZeitraum] = useState<ZeitraumOption>("alle");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.surface },
        topbar: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        word: { fontSize: 16, fontWeight: "800", color: colors.text },
        sub: { fontSize: 10, color: colors.textMuted, marginTop: 1 },
        filterButton: { padding: 4 },
        filterDot: {
          position: "absolute",
          top: 2,
          right: 2,
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: colors.accent,
        },
        backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
        sheet: {
          backgroundColor: colors.surface,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingBottom: 20,
        },
        sheetHeader: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 16,
        },
        sheetTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
        sectionLabel: {
          fontSize: 11,
          fontWeight: "700",
          color: colors.textMuted,
          textTransform: "uppercase",
          paddingHorizontal: 12,
          paddingTop: 10,
        },
        customDateRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
        customDateInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, color: colors.text },
        sheetActions: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingTop: 16 },
        resetButton: { flex: 1, alignItems: "center", paddingVertical: 12 },
        resetButtonText: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
        applyButton: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 14, backgroundColor: colors.accent },
        applyButtonText: { color: colors.onAccent, fontWeight: "700", fontSize: 13 },
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
    ...(selectedCategories.length > 0 ? { categories: selectedCategories } : {}),
    dateFrom,
    dateTo,
  }).map(toDisplayEvent);

  function widenRadius() {
    setRadiusMeters(Math.min(radiusMeters + RADIUS_STEP_METERS, MAX_RADIUS_METERS));
  }

  function toggleCategory(value: string) {
    if (value === "alle") {
      setSelectedCategories([]);
      return;
    }
    setSelectedCategories((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  function resetFilters() {
    setSelectedCategories([]);
    setZeitraum("alle");
    setCustomFrom("");
    setCustomTo("");
  }

  const filtersActive = selectedCategories.length > 0 || zeitraum !== "alle";

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <View>
          <Text style={styles.word}>Lokalfeste</Text>
          <Text style={styles.sub}>
            Alle Feste · {Math.round(radiusMeters / 1000)} km um {origin?.label ?? ""}
          </Text>
        </View>
        <Pressable
          style={styles.filterButton}
          onPress={() => setFilterModalVisible(true)}
          hitSlop={8}
          accessibilityLabel="Filter öffnen"
        >
          <Ionicons name="options-outline" size={22} color={colors.text} />
          {filtersActive ? <View style={styles.filterDot} /> : null}
        </Pressable>
      </View>
      <Modal
        visible={filterModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setFilterModalVisible(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Filter</Text>
            <Pressable onPress={() => setFilterModalVisible(false)} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>
          <Text style={styles.sectionLabel}>Kategorie</Text>
          <MultiFilterChips options={CATEGORY_OPTIONS} selected={selectedCategories} onToggle={toggleCategory} />
          <Text style={styles.sectionLabel}>Zeitraum</Text>
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
          <View style={styles.sheetActions}>
            <Pressable style={styles.resetButton} onPress={resetFilters}>
              <Text style={styles.resetButtonText}>Zurücksetzen</Text>
            </Pressable>
            <Pressable style={styles.applyButton} onPress={() => setFilterModalVisible(false)}>
              <Text style={styles.applyButtonText}>Fertig</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
          ) : filtersActive ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Keine Feste mit diesen Filtern gefunden.</Text>
              <Pressable style={styles.emptyButton} onPress={resetFilters}>
                <Text style={styles.emptyButtonText}>Filter zurücksetzen</Text>
              </Pressable>
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
