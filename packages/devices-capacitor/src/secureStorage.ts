import { registerPlugin } from "@capacitor/core";
import {
  availableCapability,
  normalizeDeviceError,
  unavailableCapability,
  type DeviceSecureStorageCapability,
} from "@absolutejs/devices";

const DEFAULT_PREFIX = "absolutejs.auth.";

export type AbsoluteSecureStorageBackend =
  "keychain" | "keystore" | "unavailable";

export type AbsoluteSecureStorageStatus = {
  backend: AbsoluteSecureStorageBackend;
  hardwareBacked: boolean;
  persistent: boolean;
  secure: boolean;
};

export type AbsoluteSecureStoragePlugin = {
  clear(options: { prefix: string }): Promise<void>;
  get(options: { key: string }): Promise<{ value: string | null }>;
  keys(options: { prefix: string }): Promise<{ keys: string[] }>;
  remove(options: { key: string }): Promise<void>;
  set(options: { key: string; value: string }): Promise<void>;
  status(): Promise<AbsoluteSecureStorageStatus>;
};

export type CapacitorSecureStorageOptions = {
  plugin?: AbsoluteSecureStoragePlugin;
  prefix?: string;
};

export const AbsoluteSecureStorage =
  registerPlugin<AbsoluteSecureStoragePlugin>("AbsoluteSecureStorage");

const requirePrefix = (value: string) => {
  if (value.length === 0)
    throw new TypeError("Capacitor secure-storage prefix cannot be empty.");
  return value;
};

const requireKey = (value: string) => {
  if (value.length === 0)
    throw new TypeError("Capacitor secure-storage key cannot be empty.");
  return value;
};

export const createCapacitorSecureStorage = (
  options: CapacitorSecureStorageOptions = {},
): DeviceSecureStorageCapability => {
  const plugin = options.plugin ?? AbsoluteSecureStorage;
  const prefix = requirePrefix(options.prefix ?? DEFAULT_PREFIX);
  const storageKey = (key: string) => `${prefix}${requireKey(key)}`;
  const call = async <T>(message: string, operation: () => Promise<T>) => {
    try {
      return await operation();
    } catch (error) {
      throw normalizeDeviceError(error, { message });
    }
  };

  return {
    capability: async () => {
      const status = await call(
        "Failed to inspect native secure storage.",
        () => plugin.status(),
      );
      return status.secure && status.persistent
        ? availableCapability("native", status)
        : unavailableCapability(
            "unavailable",
            "Native Keychain/Keystore storage is unavailable.",
            status,
          );
    },
    clear: () =>
      call("Failed to clear native secure storage.", () =>
        plugin.clear({ prefix }),
      ),
    get: async (key) => {
      const namespacedKey = storageKey(key);
      return (
        await call("Failed to read native secure storage.", () =>
          plugin.get({ key: namespacedKey }),
        )
      ).value;
    },
    keys: async () =>
      (
        await call("Failed to list native secure storage.", () =>
          plugin.keys({ prefix }),
        )
      ).keys.map((key) => key.slice(prefix.length)),
    remove: (key) => {
      const namespacedKey = storageKey(key);
      return call("Failed to remove native secure storage.", () =>
        plugin.remove({ key: namespacedKey }),
      );
    },
    set: (key, value) => {
      const namespacedKey = storageKey(key);
      return call("Failed to write native secure storage.", () =>
        plugin.set({ key: namespacedKey, value }),
      );
    },
  };
};
