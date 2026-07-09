import { render, screen } from "@testing-library/react-native";
import { EventCard } from "../src/components/EventCard";
import type { EventRecord } from "../src/lib/types";

const event: EventRecord = {
  id: "1",
  title: "Winzerfest Ihringen",
  start: "2026-08-15T18:00:00.000Z",
  location: { name: "Marktplatz" },
  category: "weinfest",
  sourceIds: ["a"],
  sourceUrl: "https://example.test/1",
  region: "test-region",
  lastSeenAt: "2026-07-09T00:00:00.000Z",
};

describe("EventCard", () => {
  it("renders the event title and location name", async () => {
    await render(<EventCard event={event} />);
    expect(screen.getByText("Winzerfest Ihringen")).toBeTruthy();
    expect(screen.getByText("Marktplatz")).toBeTruthy();
  });
});
