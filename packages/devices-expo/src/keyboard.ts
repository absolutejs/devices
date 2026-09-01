import { Keyboard, type KeyboardEvent } from "react-native";
import {
  availableCapability,
  type DeviceKeyboardCapability,
  type DeviceKeyboardState,
} from "@absolutejs/devices";
import { removable } from "./common";

export type ExpoKeyboardBindings = Pick<
  typeof Keyboard,
  "addListener" | "dismiss" | "isVisible" | "metrics"
>;

const visibleState = (
  bindings: ExpoKeyboardBindings,
): DeviceKeyboardState => ({
  heightPx: bindings.metrics()?.height ?? 0,
  visible: bindings.isVisible(),
});

export const createExpoKeyboardCapability = (
  bindings: ExpoKeyboardBindings = Keyboard,
): DeviceKeyboardCapability => ({
  capability: async () => availableCapability("native"),
  dismiss: async () => bindings.dismiss(),
  getState: async () => visibleState(bindings),
  onChange: async (listener) => {
    const shown = (event: KeyboardEvent) =>
      listener({ heightPx: event.endCoordinates.height, visible: true });
    const hidden = () => listener({ heightPx: 0, visible: false });
    const subscriptions = [
      bindings.addListener("keyboardDidShow", shown),
      bindings.addListener("keyboardDidHide", hidden),
    ];
    return removable(() => subscriptions.forEach((item) => item.remove()));
  },
});
