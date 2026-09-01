import { Share } from "react-native";
import {
  DeviceError,
  availableCapability,
  normalizeDeviceShareContent,
  type DeviceShareCapability,
} from "@absolutejs/devices";
import { expoFailure } from "./common";

export type ExpoShareBindings = Pick<typeof Share, "share">;

export const createExpoShareCapability = (
  bindings: ExpoShareBindings = Share,
): DeviceShareCapability => ({
  capability: async () => availableCapability("native"),
  share: async (value) => {
    const content = normalizeDeviceShareContent(value);
    try {
      const result = await bindings.share(
        {
          ...(content.title ? { title: content.title } : {}),
          ...(content.url ? { url: content.url } : {}),
          message: [content.text, content.url].filter(Boolean).join(" "),
        },
        content.dialogTitle ? { dialogTitle: content.dialogTitle } : undefined,
      );
      if (result.action === Share.dismissedAction)
        throw new DeviceError("cancelled", "Sharing was cancelled.");
      return {
        ...(result.activityType ? { activity: result.activityType } : {}),
        native: result,
      };
    } catch (error) {
      if (error instanceof DeviceError) throw error;
      throw expoFailure(error, "Native sharing failed.");
    }
  },
});
