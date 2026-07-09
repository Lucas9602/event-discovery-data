// app/__tests__/EventListScreen.test.tsx
import { render, screen } from "@testing-library/react-native";
import { EventListScreen } from "../src/screens/EventListScreen";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("../src/lib/getEvents", () => ({
  getEvents: jest.fn().mockResolvedValue([
    {
      id: "1",
      title: "Winzerfest Ihringen",
      start: "2026-08-15T18:00:00.000Z",
      location: { name: "Marktplatz" },
      category: "weinfest",
      sourceIds: ["a"],
      sourceUrl: "https://example.test/1",
      region: "test-region",
      lastSeenAt: "2026-07-09T00:00:00.000Z",
    },
  ]),
}));

describe("EventListScreen", () => {
  it("loads and displays events on mount", async () => {
    await render(<EventListScreen />);
    expect(await screen.findByText("Winzerfest Ihringen")).toBeTruthy();
  });
});
