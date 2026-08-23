export * from "./contracts";
export * from "./capabilities";
export * from "./links";
export { installDeviceAdapter } from "./runtime";

import { getDeviceAdapter } from "./runtime";
import { runtimeCapability, unavailableCapability } from "./capabilities";
import { DeviceError, type DeviceSubscription } from "./contracts";
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
