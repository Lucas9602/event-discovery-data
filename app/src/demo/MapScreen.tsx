import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { toEndOfDayIso, toStartOfDayIso, zeitraumToDateRange } from "../lib/dateRange";
import { filterEvents } from "../lib/filterEvents";
import { getEvents } from "../lib/getEvents";
import { eventsWithCoords } from "../lib/mapMarkers";
import type { EventRecord } from "../lib/types";
import { FilterModal } from "./FilterModal";
import { useFilters } from "./filters";
import { LeafletMap } from "./LeafletMap";
import { useLocation } from "./location";
import { useTheme } from "./theme";

const EVENTS_URL = "https://lucas9602.github.io/event-discovery-data/events.json";

export function MapScreen() {
  const { colors } = useTheme();
  const { origin, radiusMeters } = useLocation();
  const { selectedCategories, zeitraum, customFrom, customTo } = useFilters();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
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
        map: { flex: 1 },
        sheet: { padding: 14, borderTopWidth: 1, borderTopColor: colors.border },
        sheetTitle: { fontSize: 13.5, fontWeight: "700", color: colors.text },
        sheetSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
        empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
        emptyText: { fontSize: 12, color: colors.textMuted, textAlign: "center" },
      }),
    [colors],
  );

  const loadEvents = useCallback(() => {
    return getEvents((url) => fetch(url).then((res) => res.text()), AsyncStorage, EVENTS_URL).then(setEvents);
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const presetRange = zeitraumToDateRange(zeitraum, new Date());
  const dateFrom = zeitraum === "zeitraum" ? toStartOfDayIso(customFrom) : presetRange.dateFrom;
  const dateTo = zeitraum === "zeitraum" ? toEndOfDayIso(customTo) : presetRange.dateTo;

  const visibleEvents = eventsWithCoords(
    filterEvents(events, {
      ...(origin ? { origin, radiusMeters } : {}),
      ...(selectedCategories.length > 0 ? { categories: selectedCategories } : {}),
      dateFrom,
      dateTo,
    }),
  );

  const selectedEvent = visibleEvents.find((e) => e.id === selectedEventId) ?? null;
  const filtersActive = selectedCategories.length > 0 || zeitraum !== "alle";

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <Text style={styles.word}>Karte</Text>
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
      {origin && visibleEvents.length > 0 ? (
        <View style={styles.map}>
          <LeafletMap
            center={origin}
            markers={visibleEvents.map((e) => ({
              id: e.id,
              lat: e.location.lat!,
              lon: e.location.lon!,
              title: e.title,
            }))}
            onMarkerPress={setSelectedEventId}
          />
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Keine Feste mit Standort in diesem Umkreis gefunden.</Text>
        </View>
      )}
      {selectedEvent ? (
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{selectedEvent.title}</Text>
          <Text style={styles.sheetSub}>
            {selectedEvent.location.name}
            {selectedEvent.location.address ? ` · ${selectedEvent.location.address}` : ""}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
