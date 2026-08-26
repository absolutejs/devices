import { Clipboard, type ClipboardPlugin } from "@capacitor/clipboard";
import { Capacitor } from "@capacitor/core";
import {
  DeviceError,
  availableCapability,
  normalizeDeviceError,
  unavailableCapability,
  type DeviceClipboardCapability,
} from "@absolutejs/devices";
import type { CapacitorRuntimeBindings } from "./index";

export type CapacitorClipboardBindings = {
  capacitor: CapacitorRuntimeBindings;
  clipboard: ClipboardPlugin;
};

const defaultBindings = (): CapacitorClipboardBindings => ({
  capacitor: Capacitor,
  clipboard: Clipboard,
});

export const createCapacitorClipboardCapability = (
  bindings: CapacitorClipboardBindings = defaultBindings(),
): DeviceClipboardCapability => {
  const available = () =>
    bindings.capacitor.isNativePlatform() &&
    bindings.capacitor.isPluginAvailable("Clipboard");
  const requireAvailable = () => {
    if (!available())
      throw new DeviceError(
        "unsupported",
        "The Capacitor Clipboard plugin is not installed.",
      );
  };

  return {
    capability: async () =>
      available()
        ? availableCapability("native")
        : unavailableCapability(
            "unsupported",
            "The Capacitor Clipboard plugin is not installed.",
          ),
    readText: async () => {
      requireAvailable();
      try {
        return (await bindings.clipboard.read()).value;
      } catch (error) {
        throw normalizeDeviceError(error, {
          message: "Failed to read the native clipboard.",
        });
      }
    },
    writeText: async (value) => {
      requireAvailable();
      try {
        await bindings.clipboard.write({ string: value });
      } catch (error) {
        throw normalizeDeviceError(error, {
          message: "Failed to write the native clipboard.",
        });
      }
    },
  };
};
