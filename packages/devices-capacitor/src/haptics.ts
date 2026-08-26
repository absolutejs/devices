import { Capacitor } from "@capacitor/core";
import {
  Haptics,
  ImpactStyle,
  NotificationType,
  type HapticsPlugin,
} from "@capacitor/haptics";
import {
  availableCapability,
  normalizeDeviceError,
  unavailableCapability,
  type DeviceHapticImpactStyle,
  type DeviceHapticNotificationType,
  type DeviceHapticsCapability,
} from "@absolutejs/devices";
import type { CapacitorRuntimeBindings } from "./index";

export type CapacitorHapticsBindings = {
  capacitor: CapacitorRuntimeBindings;
  haptics: HapticsPlugin;
};

const defaultBindings = (): CapacitorHapticsBindings => ({
  capacitor: Capacitor,
  haptics: Haptics,
});

const impactStyle = (style: DeviceHapticImpactStyle) =>
  style === "light"
    ? ImpactStyle.Light
    : style === "heavy"
      ? ImpactStyle.Heavy
      : ImpactStyle.Medium;

const notificationType = (type: DeviceHapticNotificationType) =>
  type === "error"
    ? NotificationType.Error
    : type === "warning"
      ? NotificationType.Warning
      : NotificationType.Success;

export const createCapacitorHapticsCapability = (
  bindings: CapacitorHapticsBindings = defaultBindings(),
): DeviceHapticsCapability => {
  const available = () =>
    bindings.capacitor.isNativePlatform() &&
    bindings.capacitor.isPluginAvailable("Haptics");
  const perform = async (operation: () => Promise<void>) => {
    if (!available()) return;
    try {
      await operation();
    } catch (error) {
      throw normalizeDeviceError(error, {
        message: "Native haptic feedback failed.",
      });
    }
  };

  return {
    capability: async () =>
      available()
        ? availableCapability("native")
        : unavailableCapability(
            "unsupported",
            "The Capacitor Haptics plugin is not installed.",
          ),
    impact: async (style = "medium") =>
      perform(() => bindings.haptics.impact({ style: impactStyle(style) })),
    notification: async (type = "success") =>
      perform(() =>
        bindings.haptics.notification({ type: notificationType(type) }),
      ),
    selectionChanged: async () =>
      perform(() => bindings.haptics.selectionChanged()),
    vibrate: async (durationMs = 300) =>
      perform(() => bindings.haptics.vibrate({ duration: durationMs })),
  };
};
