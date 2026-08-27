import { Capacitor } from "@capacitor/core";
import { Keyboard, type KeyboardPlugin } from "@capacitor/keyboard";
import {
  DeviceError,
  availableCapability,
  normalizeDeviceError,
  unavailableCapability,
  type DeviceKeyboardCapability,
  type DeviceKeyboardState,
} from "@absolutejs/devices";
import type { CapacitorRuntimeBindings } from "./index";

export type CapacitorKeyboardBindings = {
  capacitor: CapacitorRuntimeBindings;
  keyboard: KeyboardPlugin;
};

const defaultBindings = (): CapacitorKeyboardBindings => ({
  capacitor: Capacitor,
  keyboard: Keyboard,
});

const installed = (bindings: CapacitorKeyboardBindings) =>
  bindings.capacitor.isNativePlatform() &&
  bindings.capacitor.isPluginAvailable("Keyboard");

const requireInstalled = (bindings: CapacitorKeyboardBindings) => {
  if (!installed(bindings))
    throw new DeviceError(
      "unsupported",
      "The Capacitor Keyboard plugin is not installed.",
    );
};

const failure = (error: unknown, message: string) =>
  normalizeDeviceError(error, { message });

export const createCapacitorKeyboardCapability = (
  bindings: CapacitorKeyboardBindings = defaultBindings(),
): DeviceKeyboardCapability => {
  let state: DeviceKeyboardState = { heightPx: 0, visible: false };

  return {
    capability: async () =>
      installed(bindings)
        ? availableCapability("native")
        : unavailableCapability(
            "unsupported",
            "The Capacitor Keyboard plugin is not installed.",
          ),
    dismiss: async () => {
      requireInstalled(bindings);
      try {
        await bindings.keyboard.hide();
        state = { heightPx: 0, visible: false };
      } catch (error) {
        throw failure(error, "Failed to dismiss the native keyboard.");
      }
    },
    getState: async () => state,
    onChange: async (listener) => {
      requireInstalled(bindings);
      try {
        const shown = await bindings.keyboard.addListener(
          "keyboardDidShow",
          ({ keyboardHeight }) => {
            state = {
              heightPx: Math.max(0, Math.round(keyboardHeight)),
              visible: true,
            };
            listener(state);
          },
        );
        let hidden;
        try {
          hidden = await bindings.keyboard.addListener(
            "keyboardDidHide",
            () => {
              state = { heightPx: 0, visible: false };
              listener(state);
            },
          );
        } catch (error) {
          await shown.remove().catch(() => undefined);
          throw error;
        }
        let active = true;
        return async () => {
          if (!active) return;
          try {
            await Promise.all([shown.remove(), hidden.remove()]);
            active = false;
          } catch (error) {
            throw failure(error, "Failed to remove native keyboard listeners.");
          }
        };
      } catch (error) {
        if (error instanceof DeviceError) throw error;
        throw failure(error, "Failed to subscribe to native keyboard state.");
      }
    },
  };
};
