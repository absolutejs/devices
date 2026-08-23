import type { DeviceAdapter } from "./contracts";
import { createSsrDeviceAdapter } from "./adapters/ssr";
import { createWebDeviceAdapter } from "./adapters/web";

type DeviceAdapterInstallation = {
  adapter: DeviceAdapter;
};

let fallbackAdapter: DeviceAdapter | undefined;
const installations: DeviceAdapterInstallation[] = [];

const defaultAdapter = () =>
  typeof window === "undefined" || typeof navigator === "undefined"
    ? createSsrDeviceAdapter()
    : createWebDeviceAdapter();

export const getDeviceAdapter = () =>
  installations.at(-1)?.adapter ?? (fallbackAdapter ??= defaultAdapter());

export const installDeviceAdapter = (next: DeviceAdapter) => {
  const installation = { adapter: next };
  installations.push(installation);

  return () => {
    const index = installations.indexOf(installation);
    if (index >= 0) installations.splice(index, 1);
  };
};
