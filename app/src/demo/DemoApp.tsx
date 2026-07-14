import { useMemo, useState } from "react";
import { Platform, SafeAreaView, StyleSheet, View } from "react-native";
import { FeedScreen } from "./FeedScreen";
import { FriendsFeedScreen } from "./FriendsFeedScreen";
import { LocationOnboarding } from "./LocationOnboarding";
import { LocationProvider, useLocation } from "./location";
import { MapScreen } from "./MapScreen";
import { ProfileScreen } from "./ProfileScreen";
import { TabBar, type DemoTab } from "./TabBar";
import { ThemeProvider, useTheme } from "./theme";

export function DemoApp() {
  return (
    <ThemeProvider>
      <LocationProvider>
        <DemoAppContent />
      </LocationProvider>
    </ThemeProvider>
  );
}

function DemoAppContent() {
  const [tab, setTab] = useState<DemoTab>("feed");
  const { colors } = useTheme();
  const { origin, hydrated } = useLocation();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.surface },
        webDesk: { flex: 1, alignItems: "center", backgroundColor: colors.background, paddingVertical: 24 },
        webPhone: {
          width: 390,
          height: 780,
          borderRadius: 28,
          overflow: "hidden",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.25,
          shadowRadius: 40,
          elevation: 12,
        },
      }),
    [colors],
  );

  if (!hydrated) return null;

  const screen = (
    <SafeAreaView style={styles.container}>
      {origin === null ? (
        <LocationOnboarding />
      ) : (
        <>
          {tab === "feed" ? <FeedScreen /> : null}
          {tab === "karte" ? <MapScreen /> : null}
          {tab === "freunde" ? <FriendsFeedScreen /> : null}
          {tab === "profil" ? <ProfileScreen /> : null}
          <TabBar active={tab} onChange={setTab} />
        </>
      )}
    </SafeAreaView>
  );

  if (Platform.OS !== "web") return screen;

  return (
    <View style={styles.webDesk}>
      <View style={styles.webPhone}>{screen}</View>
    </View>
  );
}
