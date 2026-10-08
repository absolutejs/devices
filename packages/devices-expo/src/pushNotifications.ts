import * as Notifications from "expo-notifications";
import {
  DeviceError,
  availableCapability,
  type DevicePushNotification,
  type DevicePushNotificationsCapability,
} from "@absolutejs/devices";
import { expoFailure, expoPermissionStatus, removable } from "./common";

const MAX_DATA_BYTES = 32 * 1024;
const LOCAL_PREFIX = "absolutejs-local-";

export type ExpoPushRegistration = {
  platform: "apns" | "fcm";
  token: string;
};

export type ExpoPushNotificationsOptions = {
  onRegistration?(registration: ExpoPushRegistration): Promise<void> | void;
  onUnregistration?(): Promise<void> | void;
};

const safeValue = (value: unknown, depth = 0): unknown => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return value;
  if (depth >= 8) return undefined;
  if (Array.isArray(value))
    return value
      .map((entry) => safeValue(entry, depth + 1))
      .filter((entry) => entry !== undefined);
  if (typeof value !== "object" || value === null) return undefined;
  const result: Record<string, unknown> = Object.create(null);
  for (const [key, entry] of Object.entries(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype")
      continue;
    const safe = safeValue(entry, depth + 1);
    if (safe !== undefined) result[key] = safe;
  }
  return result;
};

const safeData = (value: unknown): Record<string, unknown> => {
  const safe = safeValue(value);
  const data =
    typeof safe === "object" && safe !== null && !Array.isArray(safe)
      ? (safe as Record<string, unknown>)
      : {};
  return new TextEncoder().encode(JSON.stringify(data)).byteLength <=
    MAX_DATA_BYTES
    ? data
    : {};
};

const notification = (
  value: Notifications.Notification,
): DevicePushNotification | undefined => {
  const request = value.request;
  if (request.identifier.startsWith(LOCAL_PREFIX)) return undefined;
  return {
    ...(request.content.body ? { body: request.content.body } : {}),
    data: safeData(request.content.data),
    id: request.identifier,
    native: value,
    ...(request.content.subtitle ? { subtitle: request.content.subtitle } : {}),
    ...(request.content.title ? { title: request.content.title } : {}),
  };
};

const permission = (value: Notifications.NotificationPermissionsStatus) =>
  expoPermissionStatus(
    value,
    value.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
      value.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL,
  );

const registration = (
  value: Notifications.DevicePushToken,
): ExpoPushRegistration => {
  if (typeof value.data !== "string" || !value.data.trim())
    throw new DeviceError(
      "failed",
      "Native push registration returned an invalid token.",
    );
  return {
    platform: value.type === "ios" ? "apns" : "fcm",
    token: value.data.trim(),
  };
};

export const createExpoPushNotificationsCapability = (
  options: ExpoPushNotificationsOptions = {},
): DevicePushNotificationsCapability => {
  let tokenSubscription: { remove(): void } | undefined;
  return {
    capability: async () => availableCapability("native"),
    disable: async () => {
      let backendError: unknown;
      try {
        await options.onUnregistration?.();
      } catch (error) {
        backendError = error;
      }
      try {
        tokenSubscription?.remove();
        tokenSubscription = undefined;
        await Notifications.unregisterForNotificationsAsync();
      } catch (error) {
        throw expoFailure(
          error,
          "Failed to disable native push notifications.",
        );
      }
      if (backendError !== undefined)
        throw expoFailure(
          backendError,
          "Native push was disabled, but its backend installation could not be removed.",
        );
    },
    enable: async () => {
      try {
        const token = registration(
          await Notifications.getDevicePushTokenAsync(),
        );
        await options.onRegistration?.(token);
        tokenSubscription?.remove();
        tokenSubscription = Notifications.addPushTokenListener((next) => {
          void Promise.resolve(
            options.onRegistration?.(registration(next)),
          ).catch(() => undefined);
        });
      } catch (registrationError) {
        try {
          await Notifications.unregisterForNotificationsAsync();
        } catch (rollbackError) {
          throw new DeviceError(
            "failed",
            "Native push registration failed and could not be rolled back.",
            { cause: new AggregateError([registrationError, rollbackError]) },
          );
        }
        throw expoFailure(registrationError, "Failed to register native push.");
      }
    },
    onAction: async (listener) => {
      // A tap that launched the app can arrive before anything subscribed,
      // so the launch response is replayed once to the first subscriber and
      // then cleared. Identity guards against a platform that also reports
      // it through the listener.
      const delivered = new Set<string>();
      const deliver = (value: Notifications.NotificationResponse) => {
        const mapped = notification(value.notification);
        if (!mapped) return;
        const identity = `${mapped.id}\u0000${value.actionIdentifier}`;
        if (delivered.has(identity)) return;
        delivered.add(identity);
        listener({
          actionId:
            value.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
              ? "tap"
              : value.actionIdentifier,
          ...(value.userText ? { inputValue: value.userText } : {}),
          native: value,
          notification: mapped,
        });
      };
      const subscription =
        Notifications.addNotificationResponseReceivedListener(deliver);
      const launchResponse = Notifications.getLastNotificationResponse();
      if (launchResponse) {
        Notifications.clearLastNotificationResponse();
        deliver(launchResponse);
      }
      return removable(() => subscription.remove());
    },
    onReceived: async (listener) => {
      const subscription = Notifications.addNotificationReceivedListener(
        (value) => {
          const mapped = notification(value);
          if (mapped) listener(mapped);
        },
      );
      return removable(() => subscription.remove());
    },
    queryPermission: async () =>
      permission(await Notifications.getPermissionsAsync()),
    requestPermission: async () =>
      permission(await Notifications.requestPermissionsAsync()),
  };
};
