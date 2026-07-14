import { Pressable, Text } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FavoritesProvider, useFavorites } from "../src/demo/favorites";
import { cancelReminder, scheduleReminder } from "../src/demo/reminders";
import type { EventRecord } from "../src/lib/types";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("../src/demo/reminders", () => ({
  scheduleReminder: jest.fn(),
  cancelReminder: jest.fn(),
}));

const EVENT: EventRecord = {
  id: "1",
  title: "Weinfest",
  start: "2026-08-15T18:00:00.000Z",
  location: { name: "Marktplatz" },
  category: "weinfest",
  sourceIds: ["a"],
  sourceUrl: "https://example.test/1",
  region: "test-region",
  lastSeenAt: "2026-07-09T00:00:00.000Z",
};

function Probe() {
  const { isFavorite, toggleFavorite } = useFavorites();
  return (
    <>
      <Text>{isFavorite(EVENT.id) ? "fav:true" : "fav:false"}</Text>
      <Pressable onPress={() => toggleFavorite(EVENT)}>
        <Text>toggle</Text>
      </Pressable>
    </>
  );
}

describe("FavoritesProvider", () => {
  beforeEach(() => {
    (scheduleReminder as jest.Mock).mockReset().mockResolvedValue("notif-1");
    (cancelReminder as jest.Mock).mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await AsyncStorage.clear();
  });

  it("defaults to not favorited", async () => {
    await render(
      <FavoritesProvider>
        <Probe />
      </FavoritesProvider>,
    );
    expect(await screen.findByText("fav:false")).toBeTruthy();
  });

  it("toggling on marks it favorited, schedules a reminder, and persists it", async () => {
    await render(
      <FavoritesProvider>
        <Probe />
      </FavoritesProvider>,
    );
    fireEvent.press(await screen.findByText("toggle"));
    expect(await screen.findByText("fav:true")).toBeTruthy();
    expect(scheduleReminder).toHaveBeenCalledWith(EVENT);

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem("demo.favorites")) ?? "{}");
      expect(stored).toEqual({ "1": { notificationId: "notif-1", start: EVENT.start } });
    });
  });

  it("toggling off removes it, cancels the reminder, and persists the removal", async () => {
    await render(
      <FavoritesProvider>
        <Probe />
      </FavoritesProvider>,
    );
    fireEvent.press(await screen.findByText("toggle"));
    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem("demo.favorites")) ?? "{}");
      expect(stored["1"]).toEqual({ notificationId: "notif-1", start: EVENT.start });
    });

    fireEvent.press(await screen.findByText("toggle"));
    expect(await screen.findByText("fav:false")).toBeTruthy();
    expect(cancelReminder).toHaveBeenCalledWith("notif-1");

    const stored = JSON.parse((await AsyncStorage.getItem("demo.favorites"))!);
    expect(stored).toEqual({});
  });

  it("cancels an orphaned reminder if the item is un-favorited before scheduling resolves", async () => {
    let resolveSchedule: (id: string) => void;
    (scheduleReminder as jest.Mock).mockReturnValue(
      new Promise<string>((resolve) => {
        resolveSchedule = resolve;
      }),
    );

    await render(
      <FavoritesProvider>
        <Probe />
      </FavoritesProvider>,
    );

    fireEvent.press(await screen.findByText("toggle"));
    expect(await screen.findByText("fav:true")).toBeTruthy();

    fireEvent.press(await screen.findByText("toggle"));
    expect(await screen.findByText("fav:false")).toBeTruthy();
    expect(cancelReminder).not.toHaveBeenCalled();

    resolveSchedule!("notif-orphaned");

    await waitFor(() => {
      expect(cancelReminder).toHaveBeenCalledWith("notif-orphaned");
    });
    expect(await screen.findByText("fav:false")).toBeTruthy();
  });

  it("loads a persisted favorite on mount", async () => {
    await AsyncStorage.setItem(
      "demo.favorites",
      JSON.stringify({ "1": { notificationId: "notif-old", start: EVENT.start } }),
    );
    await render(
      <FavoritesProvider>
        <Probe />
      </FavoritesProvider>,
    );
    expect(await screen.findByText("fav:true")).toBeTruthy();
  });

  it("prunes a favorite whose event started more than 24 hours ago", async () => {
    const staleStart = new Date(Date.now() - 30 * 3600 * 1000).toISOString();
    await AsyncStorage.setItem(
      "demo.favorites",
      JSON.stringify({ "1": { notificationId: "notif-old", start: staleStart } }),
    );
    await render(
      <FavoritesProvider>
        <Probe />
      </FavoritesProvider>,
    );
    expect(await screen.findByText("fav:false")).toBeTruthy();

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem("demo.favorites")) ?? "{}");
      expect(stored).toEqual({});
    });
  });

  it("keeps a favorite whose event started less than 24 hours ago", async () => {
    const recentStart = new Date(Date.now() - 1 * 3600 * 1000).toISOString();
    await AsyncStorage.setItem(
      "demo.favorites",
      JSON.stringify({ "1": { notificationId: "notif-recent", start: recentStart } }),
    );
    await render(
      <FavoritesProvider>
        <Probe />
      </FavoritesProvider>,
    );
    expect(await screen.findByText("fav:true")).toBeTruthy();
  });
});
