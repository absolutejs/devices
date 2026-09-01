import * as NavigationBar from "expo-navigation-bar";
import { setStatusBarHidden, setStatusBarStyle } from "expo-status-bar";
import { Platform } from "react-native";
import {
  DeviceError,
  availableCapability,
  type DeviceSystemBarsCapability,
} from "@absolutejs/devices";
import { expoFailure } from "./common";

export type ExpoSystemBarsBindings = {
  os: string;
  setNavigationAppearance(appearance: "dark" | "light"): void;
  setNavigationVisible(visible: boolean): Promise<void>;
  setStatusAppearance(appearance: "auto" | "dark" | "light"): void;
  setStatusVisible(visible: boolean): void;
};

const defaultBindings = (): ExpoSystemBarsBindings => ({
  os: Platform.OS,
  setNavigationAppearance: (appearance) => NavigationBar.setStyle(appearance),
  setNavigationVisible: (visible) =>
    NavigationBar.setVisibilityAsync(visible ? "visible" : "hidden"),
  setStatusAppearance: (appearance) => setStatusBarStyle(appearance, true),
  setStatusVisible: (visible) => setStatusBarHidden(!visible, "fade"),
});

export const createExpoSystemBarsCapability = (
  bindings: ExpoSystemBarsBindings = defaultBindings(),
): DeviceSystemBarsCapability => ({
  capability: async (operation) =>
    availableCapability("native", {
      edgeToEdge: true,
      navigation:
        bindings.os === "android" && operation !== "appearance"
          ? "supported"
          : bindings.os === "android"
            ? "best-effort"
            : "unsupported",
    }),
  setAppearance: async (appearance, bar = "all") => {
    try {
      if (bar === "all" || bar === "status")
        bindings.setStatusAppearance(
          appearance === "automatic" ? "auto" : appearance,
        );
      if ((bar === "all" || bar === "navigation") && bindings.os === "android")
        bindings.setNavigationAppearance(
          appearance === "dark" ? "light" : "dark",
        );
      if (bar === "navigation" && bindings.os !== "android")
        throw new DeviceError(
          "unsupported",
          "The navigation system bar is Android-only.",
        );
    } catch (error) {
      if (error instanceof DeviceError) throw error;
      throw expoFailure(error, "Failed to set native system-bar appearance.");
    }
  },
  setVisible: async (visible, bar = "all") => {
    try {
      if (bar === "all" || bar === "status") bindings.setStatusVisible(visible);
      if ((bar === "all" || bar === "navigation") && bindings.os === "android")
        await bindings.setNavigationVisible(visible);
      if (bar === "navigation" && bindings.os !== "android")
        throw new DeviceError(
          "unsupported",
          "The navigation system bar is Android-only.",
        );
    } catch (error) {
      if (error instanceof DeviceError) throw error;
      throw expoFailure(error, "Failed to set native system-bar visibility.");
    }
  },
});
