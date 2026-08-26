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
  | "permission-required"
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

export type DeviceClipboardOperation = "read" | "write";

export type DeviceClipboardCapability = {
  capability(
    operation?: DeviceClipboardOperation,
  ): Promise<DeviceCapabilityStatus>;
  readText(): Promise<string>;
  writeText(value: string): Promise<void>;
};

export type DeviceShareContent = {
  dialogTitle?: string;
  text?: string;
  title?: string;
  url?: string;
};

export type DeviceShareResult = {
  activity?: string;
  native?: unknown;
};

export type DeviceShareCapability = {
  capability(content?: DeviceShareContent): Promise<DeviceCapabilityStatus>;
  share(content: DeviceShareContent): Promise<DeviceShareResult>;
};

export type DeviceHapticImpactStyle = "heavy" | "light" | "medium";
export type DeviceHapticNotificationType = "error" | "success" | "warning";

export type DeviceHapticsCapability = {
  capability(): Promise<DeviceCapabilityStatus>;
  impact(style?: DeviceHapticImpactStyle): Promise<void>;
  notification(type?: DeviceHapticNotificationType): Promise<void>;
  selectionChanged(): Promise<void>;
  vibrate(durationMs?: number): Promise<void>;
};

export type DeviceLocationPrecision = "coarse" | "precise";

export type DeviceLocationPermissionStatus = DevicePermissionStatus & {
  precision: DeviceLocationPrecision | "unknown";
};

export type DeviceLocationPermissionOptions = {
  precision?: DeviceLocationPrecision;
};

export type DeviceLocationOptions = {
  accuracy?: "balanced" | "high";
  maximumAgeMs?: number;
  timeoutMs?: number;
};

export type DeviceLocationWatchOptions = DeviceLocationOptions & {
  intervalMs?: number;
  minimumUpdateIntervalMs?: number;
};

export type DeviceLocationPosition = {
  accuracyMeters: number;
  altitudeAccuracyMeters?: number;
  altitudeMeters?: number;
  headingDegrees?: number;
  latitude: number;
  longitude: number;
  native?: unknown;
  speedMetersPerSecond?: number;
  timestampMs: number;
};

export type DeviceLocationEvent =
  | { position: DeviceLocationPosition; type: "position" }
  | { error: DeviceError; type: "error" };

export type DeviceLocationCapability = {
  capability(): Promise<DeviceCapabilityStatus>;
  current(options?: DeviceLocationOptions): Promise<DeviceLocationPosition>;
  queryPermission(): Promise<DeviceLocationPermissionStatus>;
  requestPermission(
    options?: DeviceLocationPermissionOptions,
  ): Promise<DeviceLocationPermissionStatus>;
  watch(
    listener: (event: DeviceLocationEvent) => void,
    options?: DeviceLocationWatchOptions,
  ): Promise<DeviceSubscription>;
};

export type DeviceCameraDirection = "front" | "rear";

export type DevicePhoto = {
  format?: string;
  height?: number;
  name?: string;
  sizeBytes?: number;
  uri?: string;
  webPath: string;
  width?: number;
};

export type DevicePhotoTransform = {
  height: number;
  quality?: number;
  width: number;
};

export type DeviceTakePhotoOptions = {
  direction?: DeviceCameraDirection;
  transform?: DevicePhotoTransform;
};

export type DevicePickPhotosOptions = {
  limit?: number;
  transform?: DevicePhotoTransform;
};

export type DeviceCameraCapability = DevicePermissionCapability & {
  capability(): Promise<DeviceCapabilityStatus>;
  takePhoto(options?: DeviceTakePhotoOptions): Promise<DevicePhoto>;
};

export type DevicePhotosCapability = {
  capability(): Promise<DeviceCapabilityStatus>;
  pick(options?: DevicePickPhotosOptions): Promise<DevicePhoto[]>;
};

export type DeviceSecureStorageCapability = DeviceStorageCapability & {
  capability(): Promise<DeviceCapabilityStatus>;
  /** Serialize a sensitive read/network/write exchange with native workers. */
  withLock?<T>(key: string, run: () => Promise<T>): Promise<T>;
};

export type DeviceAdapter = {
  back?: DeviceBackCapability;
  camera?: DeviceCameraCapability;
  clipboard?: DeviceClipboardCapability;
  haptics?: DeviceHapticsCapability;
  lifecycle: DeviceLifecycleCapability;
  links: DeviceLinksCapability;
  location?: DeviceLocationCapability;
  network: DeviceNetworkCapability;
  platform: DevicePlatformCapability;
  photos?: DevicePhotosCapability;
  runtime: DeviceRuntime;
  secureStorage?: DeviceSecureStorageCapability;
  share?: DeviceShareCapability;
  storage: DeviceStorageCapability;
};
