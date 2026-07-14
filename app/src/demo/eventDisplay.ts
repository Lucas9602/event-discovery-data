import type { EventRecord } from "../lib/types";
import type { DemoEvent } from "./demoData";

interface CategoryStyle {
  accent: string;
  image: string;
}

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  weinfest: { accent: "#b3123d", image: "https://picsum.photos/seed/lokalfeste-wein/700/700" },
  dorffest: { accent: "#3a6b5c", image: "https://picsum.photos/seed/lokalfeste-sommer/700/700" },
  "vereins-sportfest": { accent: "#c07a1e", image: "https://picsum.photos/seed/lokalfeste-sport/700/700" },
  markt: { accent: "#5b3a6e", image: "https://picsum.photos/seed/lokalfeste-markt/700/700" },
  konzert: { accent: "#2b5f8a", image: "https://picsum.photos/seed/lokalfeste-konzert/700/700" },
  sonstiges: { accent: "#5a5a5a", image: "https://picsum.photos/seed/lokalfeste-sonstiges/700/700" },
};

export function toDisplayEvent(event: EventRecord): DemoEvent {
  const style = CATEGORY_STYLES[event.category] ?? CATEGORY_STYLES.sonstiges;
  return { ...event, accent: style.accent, image: style.image };
}
