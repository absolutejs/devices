export type DeviceRuntime = "web" | "ssr" | "capacitor" | "expo" | "test";

export type DeviceCapabilityFidelity = "native" | "web" | "emulated";

export type DeviceCapabilityUnavailableReason =
  "unsupported" | "unavailable" | "permission-required" | "policy-blocked";

export type DeviceCapabilityStatus =
  | {
      available: true;
      fidelity: DeviceCapabilityFidelity;
      native?: unknown;
    }
  | {
      available: false;
      reason: DeviceCapabilityUnavailableReason;
      message?: string;
      native?: unknown;
    };

export type PermissionState =
  "prompt" | "granted" | "denied" | "blocked" | "limited" | "unavailable";

export type DevicePermissionStatus = {
  canRequest: boolean;
  native?: unknown;
  state: PermissionState;
};

export type DevicePermissionCapability = {
  queryPermission(): Promise<DevicePermissionStatus>;
  requestPermission(): Promise<DevicePermissionStatus>;
};

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

export type DeviceSafeAreaInsets = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

export type DevicePlatformInfo = {
  appBuild?: string;
  appVersion?: string;
  formFactor: "phone" | "tablet" | "desktop" | "unknown";
  isNative: boolean;
  language?: string;
  locale?: string;
  os: "android" | "ios" | "linux" | "macos" | "windows" | "unknown";
  prefersReducedMotion?: boolean;
  runtime: DeviceRuntime;
  safeAreaInsets?: DeviceSafeAreaInsets;
};

export type DeviceLifecycleState = "active" | "inactive" | "background";

export type DeviceNetworkStatus = {
  connected: boolean;
  connectionType: "wifi" | "cellular" | "ethernet" | "unknown" | "none";
};

export type DeviceRestoredOperation = {
  data?: unknown;
  error?: {
    code?: string;
    message: string;
  };
  method: string;
  native?: unknown;
  plugin: string;
  success: boolean;
};

export type DeviceBackEvent = {
  canGoBack: boolean;
  native?: unknown;
};

export type DeviceLink = {
  fragment: string;
  href: string;
  host: string;
  pathname: string;
  query: URLSearchParams;
  scheme: string;
};

export type DevicePlatformCapability = {
  getInfo(): Promise<DevicePlatformInfo>;
};

export type DeviceLifecycleCapability = {
  getState(): Promise<DeviceLifecycleState>;
  onChange(
    listener: (state: DeviceLifecycleState) => void,
  ): Promise<DeviceSubscription>;
  onRestoredOperation?(
    listener: (operation: DeviceRestoredOperation) => void,
  ): Promise<DeviceSubscription>;
  onResume?(listener: () => void): Promise<DeviceSubscription>;
};

export type DeviceLinksCapability = {
  getLaunchUrl(): Promise<string | null>;
  onOpen(listener: (url: string) => void): Promise<DeviceSubscription>;
  openExternal(url: string): Promise<void>;
};

export type DeviceBackCapability = {
  capability(): Promise<DeviceCapabilityStatus>;
  onPress(
    listener: (event: DeviceBackEvent) => void,
  ): Promise<DeviceSubscription>;
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

export type DeviceSecureStorageCapability = DeviceStorageCapability & {
  capability(): Promise<DeviceCapabilityStatus>;
};

export type DeviceAdapter = {
  back?: DeviceBackCapability;
  lifecycle: DeviceLifecycleCapability;
  links: DeviceLinksCapability;
  network: DeviceNetworkCapability;
  platform: DevicePlatformCapability;
  runtime: DeviceRuntime;
  secureStorage?: DeviceSecureStorageCapability;
  storage: DeviceStorageCapability;
};
