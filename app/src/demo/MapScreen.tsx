import { useMemo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { demoEvents } from "./demoData";
import { useTheme } from "./theme";

export function MapScreen() {
  const nearest = demoEvents[0];
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.surface },
        topbar: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
        word: { fontSize: 16, fontWeight: "800", color: colors.text },
        map: { flex: 1, position: "relative", backgroundColor: "#dce7dc" },
        pin: { position: "absolute", width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: "#fff" },
        you: { position: "absolute", top: "50%", left: "50%", width: 12, height: 12, borderRadius: 6, backgroundColor: "#1a73e8" },
        attrib: { position: "absolute", bottom: 4, right: 6, fontSize: 8, color: "rgba(0,0,0,0.55)", backgroundColor: "rgba(255,255,255,0.7)", paddingHorizontal: 4, borderRadius: 3 },
        sheet: { padding: 14, borderTopWidth: 1, borderTopColor: colors.border },
        sheetTitle: { fontSize: 13.5, fontWeight: "700", color: colors.text },
        sheetSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
        note: { fontSize: 10, color: colors.textMuted, textAlign: "center", padding: 8 },
      }),
    [colors],
  );

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <Text style={styles.word}>Karte</Text>
      </View>
      <View style={styles.map}>
        <Image
          source={{ uri: "https://staticmap.openstreetmap.de/staticmap.php?center=48.03,7.65&zoom=12&size=600x800&maptype=mapnik" }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
        {demoEvents.map((event, i) => (
          <View
            key={event.id}
            style={[
              styles.pin,
              { backgroundColor: event.accent, top: `${28 + i * 14}%`, left: `${30 + i * 12}%` },
            ]}
          />
        ))}
        <View style={styles.you} />
        <Text style={styles.attrib}>© OpenStreetMap-Mitwirkende</Text>
      </View>
      <View style={styles.sheet}>
        <Text style={styles.sheetTitle}>{nearest.title}</Text>
        <Text style={styles.sheetSub}>{nearest.location.name} · {nearest.location.address}</Text>
      </View>
      <Text style={styles.note}>
        Demo: statische Kartenkachel. Echte App bekommt eine interaktive Leaflet/OSM-Karte per WebView.
      </Text>
    </View>
  );
}
