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
