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
