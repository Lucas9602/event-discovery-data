import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { filterEvents } from "../lib/filterEvents";
import { getEvents } from "../lib/getEvents";
import type { EventRecord } from "../lib/types";
import { EventPostCard } from "./EventPostCard";
import { toDisplayEvent } from "./eventDisplay";
import { useLocation } from "./location";
import { useTheme } from "./theme";

const EVENTS_URL = "https://lucashaas.github.io/event-discovery-data/events.json";

export function FeedScreen() {
  const { colors } = useTheme();
  const { origin, radiusMeters } = useLocation();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.surface },
        topbar: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
        word: { fontSize: 16, fontWeight: "800", color: colors.text },
        sub: { fontSize: 10, color: colors.textMuted, marginTop: 1 },
      }),
    [colors],
  );

  useEffect(() => {
    getEvents((url) => fetch(url).then((res) => res.text()), AsyncStorage, EVENTS_URL).then(setEvents);
  }, []);

  const visibleEvents = filterEvents(events, origin ? { origin, radiusMeters } : {}).map(toDisplayEvent);

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
      />
    </View>
  );
}
