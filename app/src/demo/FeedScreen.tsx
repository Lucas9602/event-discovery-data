import { useMemo } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { demoEvents } from "./demoData";
import { EventPostCard } from "./EventPostCard";
import { useTheme } from "./theme";

export function FeedScreen() {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.surface },
        topbar: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
        word: { fontSize: 16, fontWeight: "800", color: colors.text },
        sub: { fontSize: 10, color: colors.textMuted, marginTop: 1 },
      }),
    [colors],
  );

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <Text style={styles.word}>Lokalfeste</Text>
        <Text style={styles.sub}>Alle Feste · 25 km um Ihringen</Text>
      </View>
      <FlatList
        data={demoEvents}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <EventPostCard event={item} />}
      />
    </View>
  );
}
