export type DeviceRuntime = "web" | "ssr" | "capacitor" | "expo" | "test";

export type DeviceErrorCode =
  | "unsupported"
  | "unavailable"
  | "permission-denied"
  | "permission-blocked"
  | "cancelled"
  | "temporarily-unavailable"
  | "failed";

export class DeviceError extends Error {
  readonly code: DeviceErrorCode;
  readonly cause?: unknown;

  constructor(
    code: DeviceErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message);
    this.name = "DeviceError";
    this.code = code;
    this.cause = options?.cause;
  }
}

export type DeviceSubscription = () => void | Promise<void>;

export type DevicePlatformInfo = {
  appBuild?: string;
  appVersion?: string;
  formFactor: "phone" | "tablet" | "desktop" | "unknown";
  isNative: boolean;
  language?: string;
  locale?: string;
  os: "android" | "ios" | "linux" | "macos" | "windows" | "unknown";
  runtime: DeviceRuntime;
};

export type DeviceLifecycleState = "active" | "inactive" | "background";

export type DeviceNetworkStatus = {
  connected: boolean;
  connectionType: "wifi" | "cellular" | "ethernet" | "unknown" | "none";
};

export type DevicePlatformCapability = {
  getInfo(): Promise<DevicePlatformInfo>;
};

export type DeviceLifecycleCapability = {
  getState(): Promise<DeviceLifecycleState>;
  onChange(
    listener: (state: DeviceLifecycleState) => void,
  ): Promise<DeviceSubscription>;
};

export type DeviceLinksCapability = {
  getLaunchUrl(): Promise<string | null>;
  onOpen(listener: (url: string) => void): Promise<DeviceSubscription>;
  openExternal(url: string): Promise<void>;
};

export type DeviceNetworkCapability = {
  getStatus(): Promise<DeviceNetworkStatus>;
  onChange(
    listener: (status: DeviceNetworkStatus) => void,
  ): Promise<DeviceSubscription>;
};

export type DeviceStorageCapability = {
  clear(): Promise<void>;
  get(key: string): Promise<string | null>;
  keys(): Promise<string[]>;
  remove(key: string): Promise<void>;
  set(key: string, value: string): Promise<void>;
};

export type DeviceAdapter = {
  lifecycle: DeviceLifecycleCapability;
  links: DeviceLinksCapability;
  network: DeviceNetworkCapability;
  platform: DevicePlatformCapability;
  runtime: DeviceRuntime;
  storage: DeviceStorageCapability;
};
