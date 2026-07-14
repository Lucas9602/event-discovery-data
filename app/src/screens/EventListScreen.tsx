import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { FlatList, SafeAreaView, StyleSheet } from "react-native";
import { EventCard } from "../components/EventCard";
import { FilterBar } from "../components/FilterBar";
import { filterEvents, type EventFilters } from "../lib/filterEvents";
import { getEvents } from "../lib/getEvents";
import type { EventRecord } from "../lib/types";

const EVENTS_URL = "https://lucas9602.github.io/event-discovery-data/events.json";

async function getCurrentPosition(): Promise<{ lat: number; lon: number }> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Location permission denied");
  }
  const position = await Location.getCurrentPositionAsync({});
  return { lat: position.coords.latitude, lon: position.coords.longitude };
}

export function EventListScreen() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [filters, setFilters] = useState<EventFilters>({});

  useEffect(() => {
    getEvents(
      (url) => fetch(url).then((res) => res.text()),
      AsyncStorage,
      EVENTS_URL,
    ).then(setEvents);
  }, []);

  const visibleEvents = filterEvents(events, filters);

  return (
    <SafeAreaView style={styles.container}>
      <FilterBar onChange={setFilters} getCurrentPosition={getCurrentPosition} />
      <FlatList
        data={visibleEvents}
        keyExtractor={(event) => event.id}
        renderItem={({ item }) => <EventCard event={item} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
