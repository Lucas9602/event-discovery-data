import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ZeitraumOption } from "../lib/dateRange";
import { useFilters } from "./filters";
import { FilterChips, type ChipOption } from "./FilterChips";
import { MultiFilterChips } from "./MultiFilterChips";
import { useTheme } from "./theme";

const CATEGORY_OPTIONS: ChipOption[] = [
  { value: "alle", label: "Alle" },
  { value: "weinfest", label: "Weinfest" },
  { value: "dorffest", label: "Dorffest & Feste" },
  { value: "konzert", label: "Konzert" },
  { value: "markt", label: "Markt" },
  { value: "fuehrung-tour", label: "Führung & Tour" },
  { value: "vereinsleben", label: "Vereinsleben" },
  { value: "geselligkeit", label: "Geselligkeit" },
  { value: "kultur", label: "Kultur" },
  { value: "sonstiges", label: "Sonstiges" },
];

const ZEITRAUM_OPTIONS: ChipOption[] = [
  { value: "alle", label: "Alle" },
  { value: "diese-woche", label: "Diese Woche" },
  { value: "dieser-monat", label: "Dieser Monat" },
  { value: "zeitraum", label: "Zeitraum wählen" },
];

interface FilterModalProps {
  visible: boolean;
  onClose: () => void;
}

export function FilterModal({ visible, onClose }: FilterModalProps) {
  const { colors } = useTheme();
  const {
    selectedCategories,
    zeitraum,
    customFrom,
    customTo,
    toggleCategory,
    setZeitraum,
    setCustomFrom,
    setCustomTo,
    resetFilters,
  } = useFilters();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
        sheet: {
          backgroundColor: colors.surface,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingBottom: 20,
        },
        sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
        sheetTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
        sectionLabel: {
          fontSize: 11,
          fontWeight: "700",
          color: colors.textMuted,
          textTransform: "uppercase",
          paddingHorizontal: 12,
          paddingTop: 10,
        },
        customDateRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
        customDateInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, color: colors.text },
        sheetActions: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingTop: 16 },
        resetButton: { flex: 1, alignItems: "center", paddingVertical: 12 },
        resetButtonText: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
        applyButton: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 14, backgroundColor: colors.accent },
        applyButtonText: { color: colors.onAccent, fontWeight: "700", fontSize: 13 },
      }),
    [colors],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Filter</Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Schließen">
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>
        <Text style={styles.sectionLabel}>Kategorie</Text>
        <MultiFilterChips options={CATEGORY_OPTIONS} selected={selectedCategories} onToggle={toggleCategory} />
        <Text style={styles.sectionLabel}>Zeitraum</Text>
        <FilterChips
          options={ZEITRAUM_OPTIONS}
          selected={zeitraum}
          onSelect={(value) => setZeitraum(value as ZeitraumOption)}
        />
        {zeitraum === "zeitraum" ? (
          <View style={styles.customDateRow}>
            <TextInput
              placeholder="Von (JJJJ-MM-TT)"
              placeholderTextColor={colors.textMuted}
              value={customFrom}
              onChangeText={setCustomFrom}
              style={styles.customDateInput}
            />
            <TextInput
              placeholder="Bis (JJJJ-MM-TT)"
              placeholderTextColor={colors.textMuted}
              value={customTo}
              onChangeText={setCustomTo}
              style={styles.customDateInput}
            />
          </View>
        ) : null}
        <View style={styles.sheetActions}>
          <Pressable style={styles.resetButton} onPress={resetFilters}>
            <Text style={styles.resetButtonText}>Zurücksetzen</Text>
          </Pressable>
          <Pressable style={styles.applyButton} onPress={onClose}>
            <Text style={styles.applyButtonText}>Fertig</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
