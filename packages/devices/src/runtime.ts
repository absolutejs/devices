import type { DeviceAdapter } from "./contracts";
import { createSsrDeviceAdapter } from "./adapters/ssr";
import { createWebDeviceAdapter } from "./adapters/web";

type DeviceAdapterInstallation = {
  adapter: DeviceAdapter;
};

type DeviceRuntimeRegistry = {
  fallbackAdapter?: DeviceAdapter;
  installations: DeviceAdapterInstallation[];
};

const RUNTIME_REGISTRY = Symbol.for("@absolutejs/devices/runtime");
const registryHost = globalThis as { [key: symbol]: unknown };
const isRuntimeRegistry = (value: unknown): value is DeviceRuntimeRegistry =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray(Reflect.get(value, "installations"));

const runtimeRegistry = (() => {
  const existing = registryHost[RUNTIME_REGISTRY];
  if (isRuntimeRegistry(existing)) return existing;

  const created: DeviceRuntimeRegistry = { installations: [] };
  Object.defineProperty(registryHost, RUNTIME_REGISTRY, {
    configurable: false,
    enumerable: false,
    value: created,
    writable: false,
  });

  return created;
})();

const defaultAdapter = () =>
  typeof window === "undefined" || typeof navigator === "undefined"
    ? createSsrDeviceAdapter()
    : createWebDeviceAdapter();

export const getDeviceAdapter = () =>
  runtimeRegistry.installations.at(-1)?.adapter ??
  (runtimeRegistry.fallbackAdapter ??= defaultAdapter());

export const installDeviceAdapter = (next: DeviceAdapter) => {
  const installation = { adapter: next };
  runtimeRegistry.installations.push(installation);

  return () => {
    const index = runtimeRegistry.installations.indexOf(installation);
    if (index >= 0) runtimeRegistry.installations.splice(index, 1);
  };
};
