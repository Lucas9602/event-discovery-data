import Slider from "@react-native-community/slider";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import type { EventFilters } from "../lib/filterEvents";
import { LocationInput, type Coordinates } from "./LocationInput";

const DEFAULT_RADIUS_METERS = 25000;
const MIN_RADIUS_METERS = 1000;
const MAX_RADIUS_METERS = 100000;

interface FilterBarProps {
  onChange: (filters: EventFilters) => void;
  getCurrentPosition: () => Promise<Coordinates>;
}

function toStartOfDayIso(dateText: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return undefined;
  return new Date(`${dateText}T00:00:00.000Z`).toISOString();
}

function toEndOfDayIso(dateText: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return undefined;
  return new Date(`${dateText}T23:59:59.999Z`).toISOString();
}

export function FilterBar({ onChange, getCurrentPosition }: FilterBarProps) {
  const [origin, setOrigin] = useState<Coordinates | undefined>(undefined);
  const [radiusMeters, setRadiusMeters] = useState(DEFAULT_RADIUS_METERS);
  const [dateFromText, setDateFromText] = useState("");
  const [dateToText, setDateToText] = useState("");

  function emit(
    nextOrigin: Coordinates | undefined,
    nextRadius: number,
    nextDateFromText: string,
    nextDateToText: string,
  ) {
    onChange({
      origin: nextOrigin,
      radiusMeters: nextOrigin ? nextRadius : undefined,
      dateFrom: toStartOfDayIso(nextDateFromText),
      dateTo: toEndOfDayIso(nextDateToText),
    });
  }

  return (
    <View style={styles.container}>
      <LocationInput
        getCurrentPosition={getCurrentPosition}
        onChange={(nextOrigin) => {
          setOrigin(nextOrigin);
          emit(nextOrigin, radiusMeters, dateFromText, dateToText);
        }}
      />
      <Text>Umkreis: {Math.round(radiusMeters / 1000)} km</Text>
      <Slider
        minimumValue={MIN_RADIUS_METERS}
        maximumValue={MAX_RADIUS_METERS}
        value={radiusMeters}
        onValueChange={(value: number) => {
          setRadiusMeters(value);
          emit(origin, value, dateFromText, dateToText);
        }}
      />
      <View style={styles.dateRow}>
        <TextInput
          placeholder="Von (JJJJ-MM-TT)"
          value={dateFromText}
          onChangeText={(text) => {
            setDateFromText(text);
            emit(origin, radiusMeters, text, dateToText);
          }}
          style={styles.dateInput}
        />
        <TextInput
          placeholder="Bis (JJJJ-MM-TT)"
          value={dateToText}
          onChangeText={(text) => {
            setDateToText(text);
            emit(origin, radiusMeters, dateFromText, text);
          }}
          style={styles.dateInput}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, padding: 12 },
  dateRow: { flexDirection: "row", gap: 8 },
  dateInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 6, padding: 8, flex: 1 },
});
