import type { EventRecord } from "../lib/types";

export interface DemoEvent extends EventRecord {
  image: string;
  accent: string;
}

export interface DemoFriend {
  id: string;
  name: string;
  initial: string;
  color: string;
}

const now = new Date();
const today = new Date(now);
today.setHours(18, 0, 0, 0);
const inThreeDays = new Date(now.getTime() + 3 * 24 * 3600 * 1000);
const inTwoWeeks = new Date(now.getTime() + 14 * 24 * 3600 * 1000);
const inFiveWeeks = new Date(now.getTime() + 35 * 24 * 3600 * 1000);

export const demoEvents: DemoEvent[] = [
  {
    id: "demo-1",
    title: "Winzerfest Ihringen",
    description: "Weinprobe & Livemusik auf dem Marktplatz.",
    start: today.toISOString(),
    location: { name: "Marktplatz", address: "Ihringen", lat: 48.0301, lon: 7.6501 },
    category: "weinfest",
    sourceIds: ["demo"],
    sourceUrl: "https://example.test/winzerfest-ihringen",
    region: "kaiserstuhl",
    lastSeenAt: now.toISOString(),
    image: "https://picsum.photos/seed/lokalfeste-wein/700/700",
    accent: "#b3123d",
  },
  {
    id: "demo-2",
    title: "Sommerfest Bötzingen",
    description: "Musik, Kuchen & Vereinsgrillstand.",
    start: inThreeDays.toISOString(),
    location: { name: "Festplatz", address: "Bötzingen", lat: 48.0866, lon: 7.6947 },
    category: "dorffest",
    sourceIds: ["demo"],
    sourceUrl: "https://example.test/sommerfest-boetzingen",
    region: "kaiserstuhl",
    lastSeenAt: now.toISOString(),
    image: "https://picsum.photos/seed/lokalfeste-sommer/700/700",
    accent: "#3a6b5c",
  },
  {
    id: "demo-3",
    title: "Vereinsturnier SV Eichstetten",
    description: "Fußballturnier der Jugendmannschaften, Bewirtung durch den Verein.",
    start: inTwoWeeks.toISOString(),
    location: { name: "Sportplatz", address: "Eichstetten", lat: 48.0801, lon: 7.7539 },
    category: "vereins-sportfest",
    sourceIds: ["demo"],
    sourceUrl: "https://example.test/turnier-eichstetten",
    region: "kaiserstuhl",
    lastSeenAt: now.toISOString(),
    image: "https://picsum.photos/seed/lokalfeste-sport/700/700",
    accent: "#c07a1e",
  },
  {
    id: "demo-4",
    title: "Herbstmarkt Eichstetten",
    description: "Regionale Erzeuger, Kunsthandwerk und Straußenwirtschaft.",
    start: inFiveWeeks.toISOString(),
    location: { name: "Rathausplatz", address: "Eichstetten", lat: 48.0791, lon: 7.7521 },
    category: "markt",
    sourceIds: ["demo"],
    sourceUrl: "https://example.test/herbstmarkt-eichstetten",
    region: "kaiserstuhl",
    lastSeenAt: now.toISOString(),
    image: "https://picsum.photos/seed/lokalfeste-markt/700/700",
    accent: "#5b3a6e",
  },
];

export const demoFriends: DemoFriend[] = [
  { id: "marie", name: "Marie", initial: "M", color: "#c9576b" },
  { id: "jonas", name: "Jonas", initial: "J", color: "#3a6b5c" },
  { id: "sina", name: "Sina", initial: "S", color: "#c07a1e" },
];

// eventId -> ids of demoFriends who liked / are "dabei"
export const demoLikesByEvent: Record<string, string[]> = {
  "demo-1": ["marie", "jonas"],
  "demo-2": ["sina"],
};
