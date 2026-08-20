import type { DeviceAdapter } from "./contracts";
import { createSsrDeviceAdapter } from "./adapters/ssr";
import { createWebDeviceAdapter } from "./adapters/web";

let adapter: DeviceAdapter | undefined;

const defaultAdapter = () =>
  typeof window === "undefined" || typeof navigator === "undefined"
    ? createSsrDeviceAdapter()
    : createWebDeviceAdapter();

export const getDeviceAdapter = () => (adapter ??= defaultAdapter());

export const installDeviceAdapter = (next: DeviceAdapter) => {
  adapter = next;
  return () => {
    if (adapter === next) adapter = undefined;
  };
};
