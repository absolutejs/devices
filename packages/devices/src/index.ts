export * from "./contracts";
export { installDeviceAdapter } from "./runtime";

import { getDeviceAdapter } from "./runtime";

export const platform = {
  getInfo: () => getDeviceAdapter().platform.getInfo(),
};

export const lifecycle = {
  getState: () => getDeviceAdapter().lifecycle.getState(),
  onChange: (
    ...args: Parameters<
      ReturnType<typeof getDeviceAdapter>["lifecycle"]["onChange"]
    >
  ) => getDeviceAdapter().lifecycle.onChange(...args),
};

export const links = {
  getLaunchUrl: () => getDeviceAdapter().links.getLaunchUrl(),
  onOpen: (
    ...args: Parameters<ReturnType<typeof getDeviceAdapter>["links"]["onOpen"]>
  ) => getDeviceAdapter().links.onOpen(...args),
  openExternal: (url: string) => getDeviceAdapter().links.openExternal(url),
};

export const network = {
  getStatus: () => getDeviceAdapter().network.getStatus(),
  onChange: (
    ...args: Parameters<
      ReturnType<typeof getDeviceAdapter>["network"]["onChange"]
    >
  ) => getDeviceAdapter().network.onChange(...args),
};

export const storage = {
  clear: () => getDeviceAdapter().storage.clear(),
  get: (key: string) => getDeviceAdapter().storage.get(key),
  keys: () => getDeviceAdapter().storage.keys(),
  remove: (key: string) => getDeviceAdapter().storage.remove(key),
  set: (key: string, value: string) =>
    getDeviceAdapter().storage.set(key, value),
};
