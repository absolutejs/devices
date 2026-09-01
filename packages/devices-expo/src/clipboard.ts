import * as Clipboard from "expo-clipboard";
import {
  DeviceError,
  availableCapability,
  type DeviceClipboardCapability,
} from "@absolutejs/devices";
import { expoFailure } from "./common";

export type ExpoClipboardBindings = Pick<
  typeof Clipboard,
  "getStringAsync" | "hasStringAsync" | "setStringAsync"
>;

export const createExpoClipboardCapability = (
  bindings: ExpoClipboardBindings = Clipboard,
): DeviceClipboardCapability => ({
  capability: async () => availableCapability("native"),
  readText: async () => {
    try {
      if (!(await bindings.hasStringAsync())) return "";
      return await bindings.getStringAsync();
    } catch (error) {
      throw expoFailure(error, "Failed to read the native clipboard.");
    }
  },
  writeText: async (value) => {
    if (typeof value !== "string")
      throw new DeviceError("failed", "Clipboard text must be a string.");
    try {
      const written = await bindings.setStringAsync(value);
      if (!written)
        throw new DeviceError("failed", "The native clipboard rejected text.");
    } catch (error) {
      throw expoFailure(error, "Failed to write the native clipboard.");
    }
  },
});
