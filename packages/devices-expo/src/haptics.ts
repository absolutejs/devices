import * as Haptics from "expo-haptics";
import {
  availableCapability,
  type DeviceHapticsCapability,
} from "@absolutejs/devices";
import { expoFailure } from "./common";

export type ExpoHapticsBindings = Pick<
  typeof Haptics,
  "impactAsync" | "notificationAsync" | "selectionAsync"
>;

export const createExpoHapticsCapability = (
  bindings: ExpoHapticsBindings = Haptics,
): DeviceHapticsCapability => {
  const run = async (operation: () => Promise<void>) => {
    try {
      await operation();
    } catch (error) {
      throw expoFailure(error, "Native haptic feedback failed.");
    }
  };
  return {
    capability: async () => availableCapability("native"),
    impact: (style = "medium") =>
      run(() =>
        bindings.impactAsync(
          style === "light"
            ? Haptics.ImpactFeedbackStyle.Light
            : style === "heavy"
              ? Haptics.ImpactFeedbackStyle.Heavy
              : Haptics.ImpactFeedbackStyle.Medium,
        ),
      ),
    notification: (type = "success") =>
      run(() =>
        bindings.notificationAsync(
          type === "error"
            ? Haptics.NotificationFeedbackType.Error
            : type === "warning"
              ? Haptics.NotificationFeedbackType.Warning
              : Haptics.NotificationFeedbackType.Success,
        ),
      ),
    selectionChanged: () => run(() => bindings.selectionAsync()),
    vibrate: () =>
      run(() => bindings.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  };
};
