import { Platform, Share } from "react-native";
import { buildShareMessage } from "../lib/share";
import type { EventRecord } from "../lib/types";

export async function shareEvent(event: EventRecord): Promise<void> {
  const message = buildShareMessage(event);

  if (Platform.OS === "web") {
    if (navigator.share) {
      await navigator.share({ title: event.title, text: message }).catch(() => {});
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(message).catch(() => {});
    }
    return;
  }

  await Share.share({ message });
}
