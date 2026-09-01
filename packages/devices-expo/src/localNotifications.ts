import * as Notifications from "expo-notifications";
import {
  availableCapability,
  normalizeDeviceLocalNotification,
  type DeviceLocalNotification,
  type DeviceLocalNotificationsCapability,
} from "@absolutejs/devices";
import { expoFailure, expoPermissionStatus, removable } from "./common";

const PREFIX = "absolutejs-local-";

const idOf = (identifier: string) => {
  const value = Number(identifier.startsWith(PREFIX) ? identifier.slice(PREFIX.length) : NaN);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
};

const stringData = (value: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] =>
      typeof entry[1] === "string",
    ),
  );

const notification = (
  request: Notifications.NotificationRequest,
): DeviceLocalNotification | undefined => {
  const id = idOf(request.identifier);
  if (id === undefined) return undefined;
  const trigger = request.trigger;
  const scheduledAtMs =
    trigger && typeof trigger === "object" && "date" in trigger
      ? Number(trigger.date)
      : undefined;
  return {
    body: request.content.body ?? "",
    data: stringData(request.content.data ?? {}),
    id,
    native: request,
    ...(Number.isFinite(scheduledAtMs) ? { scheduledAtMs } : {}),
    title: request.content.title ?? "",
  };
};

const permission = (value: Notifications.NotificationPermissionsStatus) =>
  expoPermissionStatus(
    value,
    value.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
      value.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL,
  );

export const createExpoLocalNotificationsCapability =
  (): DeviceLocalNotificationsCapability => ({
    capability: async () => availableCapability("native"),
    cancel: async (ids) => {
      try {
        await Promise.all(
          ids.map((id) =>
            Notifications.cancelScheduledNotificationAsync(`${PREFIX}${id}`),
          ),
        );
      } catch (error) {
        throw expoFailure(error, "Failed to cancel native notifications.");
      }
    },
    onAction: async (listener) => {
      const subscription = Notifications.addNotificationResponseReceivedListener(
        (value) => {
          const mapped = notification(value.notification.request);
          if (!mapped) return;
          listener({
            actionId:
              value.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
                ? "tap"
                : value.actionIdentifier,
            ...(value.userText ? { inputValue: value.userText } : {}),
            native: value,
            notification: mapped,
          });
        },
      );
      return removable(() => subscription.remove());
    },
    onReceived: async (listener) => {
      const subscription = Notifications.addNotificationReceivedListener((value) => {
        const mapped = notification(value.request);
        if (mapped) listener(mapped);
      });
      return removable(() => subscription.remove());
    },
    pending: async () =>
      (await Notifications.getAllScheduledNotificationsAsync())
        .map(notification)
        .filter((value): value is DeviceLocalNotification => value !== undefined),
    queryPermission: async () =>
      permission(await Notifications.getPermissionsAsync()),
    requestPermission: async () =>
      permission(await Notifications.requestPermissionsAsync()),
    schedule: async (value) => {
      const normalized = normalizeDeviceLocalNotification(value);
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            body: normalized.body,
            data: normalized.data,
            title: normalized.title,
          },
          identifier: `${PREFIX}${normalized.id}`,
          trigger:
            normalized.scheduledAtMs === undefined
              ? null
              : { date: normalized.scheduledAtMs, type: Notifications.SchedulableTriggerInputTypes.DATE },
        });
        return normalized;
      } catch (error) {
        throw expoFailure(error, "Failed to schedule a native notification.");
      }
    },
  });
