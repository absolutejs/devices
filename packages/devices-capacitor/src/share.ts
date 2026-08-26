import { Capacitor } from "@capacitor/core";
import { Share, type SharePlugin } from "@capacitor/share";
import {
  DeviceError,
  availableCapability,
  normalizeDeviceError,
  normalizeDeviceShareContent,
  unavailableCapability,
  type DeviceShareCapability,
} from "@absolutejs/devices";
import type { CapacitorRuntimeBindings } from "./index";

export type CapacitorShareBindings = {
  capacitor: CapacitorRuntimeBindings;
  share: SharePlugin;
};

const defaultBindings = (): CapacitorShareBindings => ({
  capacitor: Capacitor,
  share: Share,
});

export const createCapacitorShareCapability = (
  bindings: CapacitorShareBindings = defaultBindings(),
): DeviceShareCapability => {
  const installed = () =>
    bindings.capacitor.isNativePlatform() &&
    bindings.capacitor.isPluginAvailable("Share");
  const canShare = async () =>
    installed() && (await bindings.share.canShare()).value;

  return {
    capability: async () =>
      (await canShare())
        ? availableCapability("native")
        : unavailableCapability(
            "unsupported",
            "The native Share capability is unavailable.",
          ),
    share: async (content) => {
      const normalized = normalizeDeviceShareContent(content);
      if (!(await canShare()))
        throw new DeviceError(
          "unsupported",
          "The native Share capability is unavailable.",
        );
      try {
        const result = await bindings.share.share(normalized);
        return {
          ...(result.activityType ? { activity: result.activityType } : {}),
          native: result,
        };
      } catch (error) {
        const name =
          typeof error === "object" && error !== null
            ? Reflect.get(error, "name")
            : undefined;
        if (name === "AbortError")
          throw new DeviceError("cancelled", "Sharing was cancelled.", {
            cause: error,
          });
        throw normalizeDeviceError(error, {
          message: "Native sharing failed.",
        });
      }
    },
  };
};
