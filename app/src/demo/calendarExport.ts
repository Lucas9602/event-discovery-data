import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { buildIcsContent } from "../lib/ics";
import type { EventRecord } from "../lib/types";

export async function exportToCalendar(event: EventRecord): Promise<void> {
  const content = buildIcsContent(event);

  if (Platform.OS === "web") {
    const blob = new Blob([content], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${event.id}.ics`;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }

  const file = new File(Paths.cache, `${event.id}.ics`);
  file.create({ overwrite: true });
  file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType: "text/calendar", dialogTitle: "Zum Kalender hinzufügen" });
}
