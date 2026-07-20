import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import type { ChipOption } from "./FilterChips";
import { useTheme } from "./theme";

interface MultiFilterChipsProps {
  options: ChipOption[];
  selected: string[];
  onToggle: (value: string) => void;
}

// First option is always the "alle" sentinel (same convention as the
// single-select FilterChips): active when nothing else is selected,
// tapping it clears the selection instead of toggling itself in.
export function MultiFilterChips({ options, selected, onToggle }: MultiFilterChipsProps) {
  const { colors } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.row}
      contentContainerStyle={styles.content}
    >
      {options.map((option) => {
        const active = option.value === "alle" ? selected.length === 0 : selected.includes(option.value);
        return (
          <Pressable
            key={option.value}
            onPress={() => onToggle(option.value)}
            style={[
              styles.chip,
              { borderColor: colors.accent },
              active && { backgroundColor: colors.accent },
            ]}
          >
            <Text style={[styles.label, { color: active ? colors.onAccent : colors.accent }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexGrow: 0, flexShrink: 0 },
  content: { paddingHorizontal: 12, gap: 8, paddingVertical: 6 },
  chip: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  label: { fontSize: 12, fontWeight: "700" },
});
