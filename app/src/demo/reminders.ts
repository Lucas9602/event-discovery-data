import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { EventRecord } from "../lib/types";

const REMINDER_LEAD_MS = 2 * 3600 * 1000;

export async function scheduleReminder(event: EventRecord): Promise<string | null> {
  if (Platform.OS === "web") return null;

  const triggerTime = new Date(event.start).getTime() - REMINDER_LEAD_MS;
  if (triggerTime <= Date.now()) return null;

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return null;

  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Bald geht's los!",
      body: `${event.title} startet in 2 Stunden.`,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(triggerTime),
    },
  });
}

export async function cancelReminder(notificationId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}
