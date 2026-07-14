import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "./theme";

export type DemoTab = "feed" | "karte" | "freunde" | "profil";

const TABS: { key: DemoTab; label: string }[] = [
  { key: "feed", label: "Feed" },
  { key: "karte", label: "Karte" },
  { key: "freunde", label: "Freunde" },
  { key: "profil", label: "Profil" },
];

export function TabBar({ active, onChange }: { active: DemoTab; onChange: (tab: DemoTab) => void }) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        bar: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 7, paddingBottom: 10, backgroundColor: colors.surface },
        tab: { flex: 1, alignItems: "center", gap: 3 },
        dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent },
        label: { fontSize: 10, color: colors.textMuted, letterSpacing: 0.2 },
        labelActive: { color: colors.accent, fontWeight: "700" },
      }),
    [colors],
  );

  return (
    <View style={styles.bar}>
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Pressable key={tab.key} style={styles.tab} onPress={() => onChange(tab.key)}>
            {isActive ? <View style={styles.dot} /> : null}
            <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
