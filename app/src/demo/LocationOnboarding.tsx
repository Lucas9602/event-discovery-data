import Slider from "@react-native-community/slider";
import * as Location from "expo-location";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { geocodeForward, geocodeReverse } from "../lib/geocode";
import { useLocation } from "./location";
import { useTheme } from "./theme";

const LOCATION_ERROR = "Standort nicht verfügbar — bitte manuell eingeben.";
const NOT_FOUND_ERROR = "Ort nicht gefunden — bitte anders schreiben oder Postleitzahl versuchen.";
const NETWORK_ERROR = "Verbindung fehlgeschlagen — bitte erneut versuchen.";

function formatCoordLabel(lat: number, lon: number): string {
  return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
}

function fetchText(url: string): Promise<string> {
  return fetch(url, { headers: { "User-Agent": "kaiserstuhl-event-app/0.1 (lucas_haas@web.de)" } }).then((res) =>
    res.text(),
  );
}

interface LocationOnboardingProps {
  showRadiusSlider?: boolean;
  onDone?: () => void;
}

export function LocationOnboarding({ showRadiusSlider = false, onDone }: LocationOnboardingProps) {
  const { colors } = useTheme();
  const { radiusMeters, setOrigin, setRadiusMeters } = useLocation();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.surface, padding: 20, justifyContent: "center", gap: 16 },
        title: { fontSize: 18, fontWeight: "800", color: colors.text, textAlign: "center" },
        button: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 12, alignItems: "center" },
        buttonText: { color: colors.onAccent, fontWeight: "700", fontSize: 14 },
        error: { color: "#b3123d", fontSize: 12, textAlign: "center" },
        input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, color: colors.text },
        confirmButton: { borderWidth: 1.5, borderColor: colors.accent, borderRadius: 14, paddingVertical: 10, alignItems: "center" },
        confirmButtonText: { color: colors.accent, fontWeight: "700", fontSize: 13 },
        radiusLabel: { fontSize: 12, color: colors.textMuted, textAlign: "center" },
      }),
    [colors],
  );

  async function useDeviceLocation() {
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError(LOCATION_ERROR);
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      const reverseLabel = await geocodeReverse(lat, lon, fetchText).catch(() => null);
      setOrigin({ lat, lon, label: reverseLabel ?? formatCoordLabel(lat, lon) });
      onDone?.();
    } catch {
      setError(LOCATION_ERROR);
    }
  }

  async function confirmManual() {
    if (!query.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const result = await geocodeForward(query, fetchText);
      if (!result) {
        setError(NOT_FOUND_ERROR);
        return;
      }
      setOrigin(result);
      onDone?.();
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Wo bist du unterwegs?</Text>
      <Pressable style={styles.button} onPress={useDeviceLocation}>
        <Text style={styles.buttonText}>Standort verwenden</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TextInput
        placeholder="Ort oder Postleitzahl"
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={setQuery}
        style={styles.input}
      />
      <Pressable style={styles.confirmButton} onPress={confirmManual} disabled={loading}>
        {loading ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.confirmButtonText}>Bestätigen</Text>}
      </Pressable>
      {showRadiusSlider ? (
        <>
          <Text style={styles.radiusLabel}>Umkreis: {Math.round(radiusMeters / 1000)} km</Text>
          <Slider minimumValue={1000} maximumValue={100000} value={radiusMeters} onValueChange={setRadiusMeters} />
          <Pressable style={styles.confirmButton} onPress={() => onDone?.()}>
            <Text style={styles.confirmButtonText}>Fertig</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}
