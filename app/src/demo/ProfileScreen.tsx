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
