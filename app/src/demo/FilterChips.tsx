import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { useTheme } from "./theme";

export interface ChipOption {
  value: string;
  label: string;
}

interface FilterChipsProps {
  options: ChipOption[];
  selected: string;
  onSelect: (value: string) => void;
}

export function FilterChips({ options, selected, onSelect }: FilterChipsProps) {
  const { colors } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.row}
      contentContainerStyle={styles.content}
    >
      {options.map((option) => {
        const active = option.value === selected;
        return (
          <Pressable
            key={option.value}
            onPress={() => onSelect(option.value)}
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
  row: { flexGrow: 0 },
  content: { paddingHorizontal: 12, gap: 8, paddingVertical: 6 },
  chip: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  label: { fontSize: 12, fontWeight: "700" },
});
