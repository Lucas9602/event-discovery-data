import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { toEndOfDayIso, toStartOfDayIso, zeitraumToDateRange } from "../lib/dateRange";
import { filterEvents } from "../lib/filterEvents";
import { getEvents } from "../lib/getEvents";
import type { EventRecord } from "../lib/types";
import { EventPostCard } from "./EventPostCard";
import { toDisplayEvent } from "./eventDisplay";
import { FilterModal } from "./FilterModal";
import { useFilters } from "./filters";
import { useLocation } from "./location";
import { useTheme } from "./theme";

const EVENTS_URL = "https://lucas9602.github.io/event-discovery-data/events.json";
const RADIUS_STEP_METERS = 15000;
const MAX_RADIUS_METERS = 100000;

export function FeedScreen() {
  const { colors } = useTheme();
  const { origin, radiusMeters, setRadiusMeters } = useLocation();
  const { selectedCategories, zeitraum, customFrom, customTo, resetFilters } = useFilters();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
      <FilterModal visible={filterModalVisible} onClose={() => setFilterModalVisible(false)} />
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
