export * from "./contracts";
export * from "./capabilities";
export * from "./links";
export { installDeviceAdapter } from "./runtime";

import { getDeviceAdapter } from "./runtime";
import { runtimeCapability, unavailableCapability } from "./capabilities";
import {
  DeviceError,
  type DeviceClipboardOperation,
  type DeviceHapticImpactStyle,
  type DeviceHapticNotificationType,
  type DeviceShareContent,
  type DeviceSubscription,
} from "./contracts";
import { parseDeviceLink } from "./links";

const noopSubscription = (): DeviceSubscription => () => undefined;
const requireSecureStorage = () => {
  const capability = getDeviceAdapter().secureStorage;
  if (!capability)
    throw new DeviceError(
      "unsupported",
      "Secure storage is not installed for this runtime.",
    );

  return capability;
};
const unavailableOptional = (capability: string) =>
  unavailableCapability(
    "unsupported",
    `${capability} is not installed for this runtime.`,
  );

export const clipboard = {
  capability: (operation?: DeviceClipboardOperation) =>
    getDeviceAdapter().clipboard?.capability(operation) ??
    Promise.resolve(unavailableOptional("Clipboard")),
  readText: async () => {
    const capability = getDeviceAdapter().clipboard;
    if (!capability)
      throw new DeviceError(
        "unsupported",
        "Clipboard is not installed for this runtime.",
      );
    return capability.readText();
  },
  writeText: async (value: string) => {
    const capability = getDeviceAdapter().clipboard;
    if (!capability)
      throw new DeviceError(
        "unsupported",
        "Clipboard is not installed for this runtime.",
      );
    return capability.writeText(value);
  },
};

export const haptics = {
  capability: () =>
    getDeviceAdapter().haptics?.capability() ??
    Promise.resolve(unavailableOptional("Haptics")),
  impact: (style?: DeviceHapticImpactStyle) =>
    getDeviceAdapter().haptics?.impact(style) ?? Promise.resolve(),
  notification: (type?: DeviceHapticNotificationType) =>
    getDeviceAdapter().haptics?.notification(type) ?? Promise.resolve(),
  selectionChanged: () =>
    getDeviceAdapter().haptics?.selectionChanged() ?? Promise.resolve(),
  vibrate: (durationMs?: number) =>
    getDeviceAdapter().haptics?.vibrate(durationMs) ?? Promise.resolve(),
};

export const share = {
  capability: (content?: DeviceShareContent) =>
    getDeviceAdapter().share?.capability(content) ??
    Promise.resolve(unavailableOptional("Sharing")),
  share: async (content: DeviceShareContent) => {
    const capability = getDeviceAdapter().share;
    if (!capability)
      throw new DeviceError(
        "unsupported",
        "Sharing is not installed for this runtime.",
      );
    return capability.share(content);
  },
};

export const platform = {
  capability: () =>
    Promise.resolve(runtimeCapability(getDeviceAdapter().runtime)),
  getInfo: () => getDeviceAdapter().platform.getInfo(),
  info: () => getDeviceAdapter().platform.getInfo(),
};

export const lifecycle = {
  capability: () =>
    Promise.resolve(runtimeCapability(getDeviceAdapter().runtime)),
  getState: () => getDeviceAdapter().lifecycle.getState(),
  onChange: (
    ...args: Parameters<
      ReturnType<typeof getDeviceAdapter>["lifecycle"]["onChange"]
    >
  ) => getDeviceAdapter().lifecycle.onChange(...args),
  onRestoredOperation: (
    listener: Parameters<
      NonNullable<
        ReturnType<typeof getDeviceAdapter>["lifecycle"]["onRestoredOperation"]
      >
    >[0],
  ) =>
    getDeviceAdapter().lifecycle.onRestoredOperation?.(listener) ??
    Promise.resolve(noopSubscription()),
  onResume: (
    listener: Parameters<
      NonNullable<ReturnType<typeof getDeviceAdapter>["lifecycle"]["onResume"]>
    >[0],
  ) => {
    const adapter = getDeviceAdapter().lifecycle;
    if (adapter.onResume) return adapter.onResume(listener);
    return adapter.onChange((state) => {
      if (state === "active") listener();
    });
  },
  state: () => getDeviceAdapter().lifecycle.getState(),
};

export const back = {
  capability: () =>
    getDeviceAdapter().back?.capability() ??
    Promise.resolve(
      unavailableCapability(
        "unsupported",
        "Back-button interception is not supported by this runtime.",
      ),
    ),
  onPress: (
    listener: Parameters<
      NonNullable<ReturnType<typeof getDeviceAdapter>["back"]>["onPress"]
    >[0],
  ) =>
    getDeviceAdapter().back?.onPress(listener) ??
    Promise.resolve(noopSubscription()),
};

export const links = {
  capability: () =>
    Promise.resolve(runtimeCapability(getDeviceAdapter().runtime)),
  getLaunchUrl: () => getDeviceAdapter().links.getLaunchUrl(),
  getLaunchLink: async () => {
    const url = await getDeviceAdapter().links.getLaunchUrl();

    return url === null ? null : parseDeviceLink(url);
  },
  onOpen: (
    ...args: Parameters<ReturnType<typeof getDeviceAdapter>["links"]["onOpen"]>
  ) => getDeviceAdapter().links.onOpen(...args),
  onOpenLink: (listener: (link: ReturnType<typeof parseDeviceLink>) => void) =>
    getDeviceAdapter().links.onOpen((url) => listener(parseDeviceLink(url))),
  openExternal: (url: string) => getDeviceAdapter().links.openExternal(url),
};

export const secureStorage = {
  capability: () =>
    getDeviceAdapter().secureStorage?.capability() ??
    Promise.resolve(
      unavailableCapability(
        "unsupported",
        "Secure storage is not installed for this runtime.",
      ),
    ),
  clear: async () => requireSecureStorage().clear(),
  get: async (key: string) => requireSecureStorage().get(key),
  keys: async () => requireSecureStorage().keys(),
  remove: async (key: string) => requireSecureStorage().remove(key),
  set: async (key: string, value: string) =>
    requireSecureStorage().set(key, value),
};

export const network = {
  capability: () =>
    Promise.resolve(runtimeCapability(getDeviceAdapter().runtime)),
  getStatus: () => getDeviceAdapter().network.getStatus(),
  status: () => getDeviceAdapter().network.getStatus(),
  onChange: (
    ...args: Parameters<
      ReturnType<typeof getDeviceAdapter>["network"]["onChange"]
    >
  ) => getDeviceAdapter().network.onChange(...args),
};

export const storage = {
  capability: () =>
    Promise.resolve(runtimeCapability(getDeviceAdapter().runtime)),
  clear: () => getDeviceAdapter().storage.clear(),
  get: (key: string) => getDeviceAdapter().storage.get(key),
  keys: () => getDeviceAdapter().storage.keys(),
  remove: (key: string) => getDeviceAdapter().storage.remove(key),
  set: (key: string, value: string) =>
    getDeviceAdapter().storage.set(key, value),
};
