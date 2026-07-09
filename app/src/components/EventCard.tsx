import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import type { EventRecord } from "../lib/types";

export function EventCard({ event }: { event: EventRecord }) {
  const date = new Date(event.start).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <Pressable style={styles.card} onPress={() => Linking.openURL(event.sourceUrl)}>
      <Text style={styles.title}>{event.title}</Text>
      <Text>{date}</Text>
      {event.location.name ? <Text>{event.location.name}</Text> : null}
      <Text style={styles.category}>{event.category}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: 12, borderRadius: 8, borderWidth: 1, borderColor: "#ddd", marginVertical: 6 },
  title: { fontWeight: "bold", fontSize: 16 },
  category: { color: "#666", marginTop: 4 },
});
