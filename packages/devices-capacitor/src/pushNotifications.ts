import { Capacitor } from "@capacitor/core";
import {
  PushNotifications,
  type ActionPerformed,
  type PermissionStatus,
  type PushNotificationSchema,
  type PushNotificationsPlugin,
} from "@capacitor/push-notifications";
import {
  DeviceError,
  availableCapability,
  normalizeDeviceError,
  unavailableCapability,
  type DevicePermissionStatus,
  type DevicePushNotification,
  type DevicePushNotificationsCapability,
} from "@absolutejs/devices";
import type { CapacitorRuntimeBindings } from "./index";

const REGISTRATION_TIMEOUT_MS = 15_000;
const MAX_DATA_BYTES = 32 * 1024;

export type CapacitorPushRegistration = {
  platform: "apns" | "fcm";
  token: string;
};

export type CapacitorPushNotificationsBindings = {
  capacitor: CapacitorRuntimeBindings;
  pushNotifications: PushNotificationsPlugin;
};

export type CapacitorPushNotificationsOptions = {
  bindings?: CapacitorPushNotificationsBindings;
  /** Internal registration sink. Raw tokens must be sent only to a trusted backend. */
  onRegistration?: (
    registration: CapacitorPushRegistration,
  ) => Promise<void> | void;
  /** Remove the current installation from the trusted backend before unregistering. */
  onUnregistration?: () => Promise<void> | void;
  registrationTimeoutMs?: number;
};

const defaultBindings = (): CapacitorPushNotificationsBindings => ({
  capacitor: Capacitor,
  pushNotifications: PushNotifications,
});

const installed = (bindings: CapacitorPushNotificationsBindings) =>
  bindings.capacitor.isNativePlatform() &&
  bindings.capacitor.isPluginAvailable("PushNotifications");

const requireInstalled = (bindings: CapacitorPushNotificationsBindings) => {
  if (!installed(bindings))
    throw new DeviceError(
      "unsupported",
      "The Capacitor Push Notifications plugin is not installed.",
    );
};

const permissionStatus = (status: PermissionStatus): DevicePermissionStatus => {
  const state =
    status.receive === "prompt-with-rationale" ? "prompt" : status.receive;
  return { canRequest: state === "prompt", native: status, state };
};

const safeDataValue = (value: unknown, depth = 0): unknown => {
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
      .map((item) => safeDataValue(item, depth + 1))
      .filter((item) => item !== undefined);
  if (typeof value !== "object" || value === null) return undefined;
  const result: Record<string, unknown> = Object.create(null);
  for (const [key, item] of Object.entries(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype")
      continue;
    const safe = safeDataValue(item, depth + 1);
    if (safe !== undefined) result[key] = safe;
  }
  return result;
};

const notificationData = (value: unknown) => {
  const safe = safeDataValue(value);
  const data =
    typeof safe === "object" && safe !== null && !Array.isArray(safe)
      ? (safe as Record<string, unknown>)
      : {};
  if (
    new TextEncoder().encode(JSON.stringify(data)).byteLength > MAX_DATA_BYTES
  )
    return {};
  return data;
};

const notification = (
  value: PushNotificationSchema,
): DevicePushNotification => ({
  ...(value.body === undefined ? {} : { body: value.body }),
  data: notificationData(value.data),
  id: String(value.id),
  native: value,
  ...(value.subtitle === undefined ? {} : { subtitle: value.subtitle }),
  ...(value.title === undefined ? {} : { title: value.title }),
});

const action = (value: ActionPerformed) => ({
  actionId: value.actionId || "tap",
  ...(value.inputValue === undefined ? {} : { inputValue: value.inputValue }),
  native: value,
  notification: notification(value.notification),
});

const nativeFailure = (error: unknown, message: string) =>
  normalizeDeviceError(error, { message });

const removable = (remove: () => Promise<void>) => {
  let active = true;
  return async () => {
    if (!active) return;
    active = false;
    try {
      await remove();
    } catch (error) {
      active = true;
      throw nativeFailure(
        error,
        "Failed to remove a push notification listener.",
      );
    }
  };
};

export const createCapacitorPushNotificationsCapability = (
  options: CapacitorPushNotificationsOptions = {},
): DevicePushNotificationsCapability => {
  const bindings = options.bindings ?? defaultBindings();
  const timeoutMs = options.registrationTimeoutMs ?? REGISTRATION_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new TypeError("Push registrationTimeoutMs must be positive.");

  return {
    capability: async () =>
      installed(bindings)
        ? availableCapability("native")
        : unavailableCapability(
            "unsupported",
            "The Capacitor Push Notifications plugin is not installed.",
          ),
    disable: async () => {
      requireInstalled(bindings);
      let backendError: unknown;
      try {
        await options.onUnregistration?.();
      } catch (error) {
        backendError = error;
      }
      try {
        await bindings.pushNotifications.unregister();
      } catch (error) {
        throw nativeFailure(
          error,
          "Failed to disable native push notifications.",
        );
      }
      if (backendError !== undefined)
        throw nativeFailure(
          backendError,
          "Native push was disabled, but its backend installation could not be removed.",
        );
    },
    enable: async () => {
      requireInstalled(bindings);
      try {
        await new Promise<void>(async (resolve, reject) => {
          let settled = false;
          let registrationHandle:
            | Awaited<ReturnType<PushNotificationsPlugin["addListener"]>>
            | undefined;
          let errorHandle:
            | Awaited<ReturnType<PushNotificationsPlugin["addListener"]>>
            | undefined;
          const finish = async (error?: unknown) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            await Promise.allSettled([
              registrationHandle?.remove(),
              errorHandle?.remove(),
            ]);
            if (error === undefined) resolve();
            else reject(error);
          };
          const timer = setTimeout(
            () =>
              void finish(
                new DeviceError(
                  "temporarily-unavailable",
                  "Native push registration timed out.",
                ),
              ),
            timeoutMs,
          );
          try {
            registrationHandle = await bindings.pushNotifications.addListener(
              "registration",
              ({ value }) => {
                const token = value.trim();
                if (!token) {
                  void finish(
                    new DeviceError(
                      "failed",
                      "Native push registration returned an empty token.",
                    ),
                  );
                  return;
                }
                const platform =
                  bindings.capacitor.getPlatform() === "ios" ? "apns" : "fcm";
                Promise.resolve(options.onRegistration?.({ platform, token }))
                  .then(() => finish())
                  .catch((error) =>
                    finish(
                      nativeFailure(
                        error,
                        "The backend rejected native push registration.",
                      ),
                    ),
                  );
              },
            );
            errorHandle = await bindings.pushNotifications.addListener(
              "registrationError",
              ({ error }) =>
                void finish(
                  new DeviceError(
                    "temporarily-unavailable",
                    `Native push registration failed: ${error}`,
                  ),
                ),
            );
            await bindings.pushNotifications.register();
          } catch (error) {
            await finish(
              nativeFailure(error, "Failed to register for native push."),
            );
          }
        });
      } catch (registrationError) {
        try {
          await bindings.pushNotifications.unregister();
        } catch (rollbackError) {
          throw new DeviceError(
            "failed",
            "Native push registration failed and could not be rolled back.",
            { cause: new AggregateError([registrationError, rollbackError]) },
          );
        }
        throw registrationError;
      }
    },
    onAction: async (listener) => {
      requireInstalled(bindings);
      try {
        const handle = await bindings.pushNotifications.addListener(
          "pushNotificationActionPerformed",
          (value) => listener(action(value)),
        );
        return removable(() => handle.remove());
      } catch (error) {
        throw nativeFailure(error, "Failed to listen for push actions.");
      }
    },
    onReceived: async (listener) => {
      requireInstalled(bindings);
      try {
        const handle = await bindings.pushNotifications.addListener(
          "pushNotificationReceived",
          (value) => listener(notification(value)),
        );
        return removable(() => handle.remove());
      } catch (error) {
        throw nativeFailure(error, "Failed to listen for push notifications.");
      }
    },
    queryPermission: async () => {
      requireInstalled(bindings);
      try {
        return permissionStatus(
          await bindings.pushNotifications.checkPermissions(),
        );
      } catch (error) {
        throw nativeFailure(
          error,
          "Failed to read push notification permission.",
        );
      }
    },
    requestPermission: async () => {
      requireInstalled(bindings);
      try {
        return permissionStatus(
          await bindings.pushNotifications.requestPermissions(),
        );
      } catch (error) {
        throw nativeFailure(
          error,
          "Failed to request push notification permission.",
        );
      }
    },
  };
};
