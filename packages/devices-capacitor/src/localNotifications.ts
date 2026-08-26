import { Capacitor } from "@capacitor/core";
import {
  LocalNotifications,
  type ActionPerformed,
  type LocalNotificationSchema,
  type LocalNotificationsPlugin,
  type PendingLocalNotificationSchema,
  type PermissionStatus,
} from "@capacitor/local-notifications";
import {
  DeviceError,
  availableCapability,
  normalizeDeviceError,
  normalizeDeviceLocalNotification,
  unavailableCapability,
  type DeviceLocalNotification,
  type DeviceLocalNotificationsCapability,
  type DevicePermissionStatus,
} from "@absolutejs/devices";
import type { CapacitorRuntimeBindings } from "./index";

const EXTRA_DATA_KEY = "__absolutejsLocalNotificationData";

export type CapacitorLocalNotificationsBindings = {
  capacitor: CapacitorRuntimeBindings;
  localNotifications: LocalNotificationsPlugin;
};

const defaultBindings = (): CapacitorLocalNotificationsBindings => ({
  capacitor: Capacitor,
  localNotifications: LocalNotifications,
});

const installed = (bindings: CapacitorLocalNotificationsBindings) =>
  bindings.capacitor.isNativePlatform() &&
  bindings.capacitor.isPluginAvailable("LocalNotifications");

const requireInstalled = (bindings: CapacitorLocalNotificationsBindings) => {
  if (!installed(bindings))
    throw new DeviceError(
      "unsupported",
      "The Capacitor Local Notifications plugin is not installed.",
    );
};

const permissionStatus = (status: PermissionStatus): DevicePermissionStatus => {
  const state =
    status.display === "prompt-with-rationale" ? "prompt" : status.display;
  return {
    canRequest: state === "prompt",
    native: status,
    state,
  };
};

const nativeFailure = (error: unknown, message: string) =>
  normalizeDeviceError(error, { message });

const notificationData = (extra: unknown) => {
  if (typeof extra !== "object" || extra === null) return undefined;
  const value = Reflect.get(extra, EXTRA_DATA_KEY);
  if (typeof value !== "object" || value === null) return undefined;
  const entries = Object.entries(value);
  if (entries.some(([, item]) => typeof item !== "string")) return undefined;
  return Object.fromEntries(entries) as Record<string, string>;
};

const scheduleTime = (value: LocalNotificationSchema["schedule"]) => {
  const at = value?.at;
  if (at === undefined) return undefined;
  const timestamp =
    at instanceof Date ? at.getTime() : new Date(String(at)).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
};

const normalizeProviderNotification = (
  value: LocalNotificationSchema | PendingLocalNotificationSchema,
): DeviceLocalNotification => {
  try {
    return {
      ...normalizeDeviceLocalNotification({
        body: value.body,
        ...(notificationData(value.extra) === undefined
          ? {}
          : { data: notificationData(value.extra) }),
        id: value.id,
        ...(scheduleTime(value.schedule) === undefined
          ? {}
          : { scheduledAtMs: scheduleTime(value.schedule) }),
        title: value.title,
      }),
      native: value,
    };
  } catch (error) {
    throw new DeviceError(
      "failed",
      "The native provider returned an invalid local notification.",
      { cause: error },
    );
  }
};

const action = (value: ActionPerformed) => ({
  actionId: value.actionId || "tap",
  ...(value.inputValue === undefined ? {} : { inputValue: value.inputValue }),
  native: value,
  notification: normalizeProviderNotification(value.notification),
});

const removable = (remove: () => Promise<void>) => {
  let active = true;
  return async () => {
    if (!active) return;
    active = false;
    try {
      await remove();
    } catch (error) {
      active = true;
      throw nativeFailure(error, "Failed to remove a notification listener.");
    }
  };
};

export const createCapacitorLocalNotificationsCapability = (
  bindings: CapacitorLocalNotificationsBindings = defaultBindings(),
): DeviceLocalNotificationsCapability => {
  const queryPermission = async () => {
    requireInstalled(bindings);
    try {
      return permissionStatus(
        await bindings.localNotifications.checkPermissions(),
      );
    } catch (error) {
      throw nativeFailure(
        error,
        "Failed to read native notification permission.",
      );
    }
  };

  return {
    cancel: async (ids) => {
      requireInstalled(bindings);
      if (
        ids.some(
          (id) => !Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647,
        )
      )
        throw new TypeError(
          "Local notification ids must be positive 32-bit integers.",
        );
      try {
        await bindings.localNotifications.cancel({
          notifications: ids.map((id) => ({ id })),
        });
      } catch (error) {
        throw nativeFailure(error, "Failed to cancel local notifications.");
      }
    },
    capability: async () =>
      installed(bindings)
        ? availableCapability("native")
        : unavailableCapability(
            "unsupported",
            "The Capacitor Local Notifications plugin is not installed.",
          ),
    onAction: async (listener) => {
      requireInstalled(bindings);
      try {
        const handle = await bindings.localNotifications.addListener(
          "localNotificationActionPerformed",
          (value) => listener(action(value)),
        );
        return removable(() => handle.remove());
      } catch (error) {
        throw nativeFailure(
          error,
          "Failed to listen for notification actions.",
        );
      }
    },
    onReceived: async (listener) => {
      requireInstalled(bindings);
      try {
        const handle = await bindings.localNotifications.addListener(
          "localNotificationReceived",
          (value) => listener(normalizeProviderNotification(value)),
        );
        return removable(() => handle.remove());
      } catch (error) {
        throw nativeFailure(error, "Failed to listen for local notifications.");
      }
    },
    pending: async () => {
      requireInstalled(bindings);
      try {
        const result = await bindings.localNotifications.getPending();
        return result.notifications.map(normalizeProviderNotification);
      } catch (error) {
        throw nativeFailure(error, "Failed to list pending notifications.");
      }
    },
    queryPermission,
    requestPermission: async () => {
      requireInstalled(bindings);
      try {
        return permissionStatus(
          await bindings.localNotifications.requestPermissions(),
        );
      } catch (error) {
        throw nativeFailure(
          error,
          "Failed to request native notification permission.",
        );
      }
    },
    schedule: async (input) => {
      requireInstalled(bindings);
      const permission = await queryPermission();
      if (permission.state !== "granted")
        throw new DeviceError(
          permission.state === "denied"
            ? "permission-denied"
            : permission.state === "blocked"
              ? "permission-blocked"
              : permission.state === "unavailable"
                ? "unavailable"
                : "permission-required",
          "Notification permission must be explicitly granted before scheduling.",
        );
      const notification = normalizeDeviceLocalNotification(input);
      try {
        await bindings.localNotifications.schedule({
          notifications: [
            {
              body: notification.body,
              ...(notification.data === undefined
                ? {}
                : { extra: { [EXTRA_DATA_KEY]: notification.data } }),
              id: notification.id,
              ...(notification.scheduledAtMs === undefined
                ? {}
                : { schedule: { at: new Date(notification.scheduledAtMs) } }),
              title: notification.title,
            },
          ],
        });
        return notification;
      } catch (error) {
        throw nativeFailure(error, "Failed to schedule a local notification.");
      }
    },
  };
};
