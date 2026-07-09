import { useState } from "react";
import { Button, StyleSheet, Text, TextInput, View } from "react-native";

export interface Coordinates {
  lat: number;
  lon: number;
}

interface LocationInputProps {
  onChange: (origin: Coordinates | undefined) => void;
  getCurrentPosition: () => Promise<Coordinates>;
}

export function LocationInput({ onChange, getCurrentPosition }: LocationInputProps) {
  const [deviceActive, setDeviceActive] = useState(false);
  const [manualLat, setManualLat] = useState("");
  const [manualLon, setManualLon] = useState("");

  async function useDeviceLocation() {
    const position = await getCurrentPosition();
    setDeviceActive(true);
    onChange(position);
  }

  function updateManual(latText: string, lonText: string) {
    setManualLat(latText);
    setManualLon(lonText);
    const lat = parseFloat(latText);
    const lon = parseFloat(lonText);
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
      setDeviceActive(false);
      onChange({ lat, lon });
    }
  }

  return (
    <View style={styles.container}>
      <Button title="Standort verwenden" onPress={useDeviceLocation} />
      {deviceActive ? <Text>Standort aktiv</Text> : null}
      <View style={styles.manualRow}>
        <TextInput
          placeholder="Breitengrad"
          keyboardType="numeric"
          value={manualLat}
          onChangeText={(text) => updateManual(text, manualLon)}
          style={styles.input}
        />
        <TextInput
          placeholder="Längengrad"
          keyboardType="numeric"
          value={manualLon}
          onChangeText={(text) => updateManual(manualLat, text)}
          style={styles.input}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  manualRow: { flexDirection: "row", gap: 8 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 6, padding: 8, flex: 1 },
});
