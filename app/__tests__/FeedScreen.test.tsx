import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { FavoritesProvider } from "../src/demo/favorites";
import { FeedScreen } from "../src/demo/FeedScreen";
import { LocationProvider } from "../src/demo/location";
import { ThemeProvider } from "../src/demo/theme";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

const EVENTS = [
  {
    id: "1",
    title: "Weinfest Ihringen",
    start: "2026-08-15T18:00:00.000Z",
    location: {},
    category: "weinfest",
    sourceIds: ["a"],
    sourceUrl: "https://example.test/1",
    region: "test",
    lastSeenAt: "2026-07-09T00:00:00.000Z",
  },
];

beforeEach(() => {
  globalThis.fetch = jest.fn().mockResolvedValue({
    text: () => Promise.resolve(JSON.stringify(EVENTS)),
  }) as unknown as typeof fetch;
});

describe("FeedScreen filter empty state", () => {
  it("shows a filter-specific empty message and reset button when a filter excludes every event", async () => {
    await render(
      <ThemeProvider>
        <LocationProvider>
          <FavoritesProvider>
            <FeedScreen />
          </FavoritesProvider>
        </LocationProvider>
      </ThemeProvider>,
    );

    await screen.findAllByText("Weinfest Ihringen");

    fireEvent.press(screen.getByText("Konzert"));

    await waitFor(() => {
      expect(screen.getByText("Keine Feste mit diesen Filtern gefunden.")).toBeTruthy();
    });
    expect(screen.getByText("Filter zurücksetzen")).toBeTruthy();
    expect(screen.queryByText("Umkreis vergrößern (+15 km)")).toBeNull();
  });

  it("resetting filters brings the event back", async () => {
    await render(
      <ThemeProvider>
        <LocationProvider>
          <FavoritesProvider>
            <FeedScreen />
          </FavoritesProvider>
        </LocationProvider>
      </ThemeProvider>,
    );

    await screen.findAllByText("Weinfest Ihringen");
    fireEvent.press(screen.getByText("Konzert"));
    await screen.findByText("Filter zurücksetzen");

    fireEvent.press(screen.getByText("Filter zurücksetzen"));

    await screen.findAllByText("Weinfest Ihringen");
  });
});
