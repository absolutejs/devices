import {
  Capacitor,
  SystemBars,
  SystemBarsStyle,
  SystemBarType,
} from "@capacitor/core";
import {
  DeviceError,
  availableCapability,
  normalizeDeviceError,
  unavailableCapability,
  type DeviceSystemBar,
  type DeviceSystemBarAppearance,
  type DeviceSystemBarsCapability,
} from "@absolutejs/devices";
import type { CapacitorRuntimeBindings } from "./index";

export type CapacitorSystemBarsBindings = {
  capacitor: CapacitorRuntimeBindings;
  systemBars: typeof SystemBars;
};

const defaultBindings = (): CapacitorSystemBarsBindings => ({
  capacitor: Capacitor,
  systemBars: SystemBars,
});

const installed = (bindings: CapacitorSystemBarsBindings) =>
  bindings.capacitor.isNativePlatform() &&
  bindings.capacitor.isPluginAvailable("SystemBars");

const requireInstalled = (bindings: CapacitorSystemBarsBindings) => {
  if (!installed(bindings))
    throw new DeviceError(
      "unsupported",
      "The Capacitor 8 SystemBars core plugin is unavailable.",
    );
};

const providerBar = (bar: DeviceSystemBar | undefined) =>
  bar === "status"
    ? SystemBarType.StatusBar
    : bar === "navigation"
      ? SystemBarType.NavigationBar
      : undefined;

const providerStyle = (appearance: DeviceSystemBarAppearance) =>
  appearance === "automatic"
    ? SystemBarsStyle.Default
    : appearance === "light"
      ? SystemBarsStyle.Dark
      : SystemBarsStyle.Light;

const options = (bar: DeviceSystemBar | undefined) => {
  const provider = providerBar(bar);
  return provider === undefined ? {} : { bar: provider };
};

export const createCapacitorSystemBarsCapability = (
  bindings: CapacitorSystemBarsBindings = defaultBindings(),
): DeviceSystemBarsCapability => ({
  capability: async () =>
    installed(bindings)
      ? availableCapability("native", { edgeToEdge: true })
      : unavailableCapability(
          "unsupported",
          "The Capacitor 8 SystemBars core plugin is unavailable.",
        ),
  setAppearance: async (appearance, bar = "all") => {
    requireInstalled(bindings);
    try {
      await bindings.systemBars.setStyle({
        ...options(bar),
        style: providerStyle(appearance),
      });
    } catch (error) {
      throw normalizeDeviceError(error, {
        message: "Failed to set native system-bar appearance.",
      });
    }
  },
  setVisible: async (visible, bar = "all") => {
    requireInstalled(bindings);
    try {
      await bindings.systemBars[visible ? "show" : "hide"](options(bar));
    } catch (error) {
      throw normalizeDeviceError(error, {
        message: "Failed to set native system-bar visibility.",
      });
    }
  },
});
