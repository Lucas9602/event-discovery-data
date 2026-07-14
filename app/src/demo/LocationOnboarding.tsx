import Slider from "@react-native-community/slider";
import * as Location from "expo-location";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocation } from "./location";
import { useTheme } from "./theme";

const LOCATION_ERROR = "Standort nicht verfügbar — bitte manuell eingeben.";

function formatCoordLabel(lat: number, lon: number): string {
  return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
}

interface LocationOnboardingProps {
  showRadiusSlider?: boolean;
  onDone?: () => void;
}

export function LocationOnboarding({ showRadiusSlider = false, onDone }: LocationOnboardingProps) {
  const { colors } = useTheme();
  const { radiusMeters, setOrigin, setRadiusMeters } = useLocation();
  const [manualLat, setManualLat] = useState("");
  const [manualLon, setManualLon] = useState("");
  const [error, setError] = useState<string | null>(null);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.surface, padding: 20, justifyContent: "center", gap: 16 },
        title: { fontSize: 18, fontWeight: "800", color: colors.text, textAlign: "center" },
        button: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 12, alignItems: "center" },
        buttonText: { color: colors.onAccent, fontWeight: "700", fontSize: 14 },
        error: { color: "#b3123d", fontSize: 12, textAlign: "center" },
        manualRow: { flexDirection: "row", gap: 8 },
        input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, color: colors.text },
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
      setOrigin({ lat, lon, label: formatCoordLabel(lat, lon) });
      onDone?.();
    } catch {
      setError(LOCATION_ERROR);
    }
  }

  function confirmManual() {
    const lat = parseFloat(manualLat);
    const lon = parseFloat(manualLon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return;
    setOrigin({ lat, lon, label: formatCoordLabel(lat, lon) });
    onDone?.();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Wo bist du unterwegs?</Text>
      <Pressable style={styles.button} onPress={useDeviceLocation}>
        <Text style={styles.buttonText}>Standort verwenden</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.manualRow}>
        <TextInput
          placeholder="Breitengrad"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          value={manualLat}
          onChangeText={setManualLat}
          style={styles.input}
        />
        <TextInput
          placeholder="Längengrad"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          value={manualLon}
          onChangeText={setManualLon}
          style={styles.input}
        />
      </View>
      <Pressable style={styles.confirmButton} onPress={confirmManual}>
        <Text style={styles.confirmButtonText}>Bestätigen</Text>
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
