import { useMemo } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { demoEvents, demoFriends, demoLikesByEvent } from "./demoData";
import { EventPostCard } from "./EventPostCard";
import { useTheme } from "./theme";

const likedEntries = Object.entries(demoLikesByEvent)
  .map(([eventId, friendIds]) => {
    const event = demoEvents.find((e) => e.id === eventId);
    const friends = friendIds.map((id) => demoFriends.find((f) => f.id === id)!).filter(Boolean);
    return event ? { event, friends } : null;
  })
  .filter((entry): entry is { event: (typeof demoEvents)[number]; friends: typeof demoFriends } => entry !== null);

export function FriendsFeedScreen() {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.surface },
        topbar: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
        word: { fontSize: 16, fontWeight: "800", color: colors.text },
        sub: { fontSize: 10, color: colors.textMuted, marginTop: 1 },
        avstackRow: { flexDirection: "row", alignItems: "center", gap: 9, padding: 12, paddingBottom: 8 },
        avstack: { flexDirection: "row" },
        av: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.surface, alignItems: "center", justifyContent: "center" },
        avText: { color: "#fff", fontSize: 9, fontWeight: "700" },
        liketext: { fontSize: 11.5, color: colors.text },
        bold: { fontWeight: "700" },
        empty: { alignItems: "center", padding: 32 },
        emptyTitle: { fontSize: 13, fontWeight: "700", color: colors.text },
        emptySub: { fontSize: 11, color: colors.textMuted, marginTop: 4, textAlign: "center" },
      }),
    [colors],
  );

  return (
    <View style={styles.container}>
      <View style={styles.topbar}>
        <Text style={styles.word}>Freunde</Text>
        <Text style={styles.sub}>Was deine Freunde geliked haben</Text>
      </View>
      <FlatList
        data={likedEntries}
        keyExtractor={(entry) => entry.event.id}
        renderItem={({ item }) => (
          <View>
            <View style={styles.avstackRow}>
              <View style={styles.avstack}>
                {item.friends.map((f, i) => (
                  <View key={f.id} style={[styles.av, { backgroundColor: f.color, marginLeft: i === 0 ? 0 : -8 }]}>
                    <Text style={styles.avText}>{f.initial}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.liketext}>
                <Text style={styles.bold}>{item.friends.map((f) => f.name).join(" und ")}</Text>{" "}
                {item.friends.length === 1 ? "gefällt das" : "sind dabei"}
              </Text>
            </View>
            <EventPostCard event={item.event} initiallyDabei={item.friends.length > 1} />
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Noch nichts von Freunden</Text>
            <Text style={styles.emptySub}>Sobald Freunde ein Fest liken, taucht es hier auf.</Text>
          </View>
        }
      />
    </View>
  );
}
