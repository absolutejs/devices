export * from "./contracts";
export * from "./capabilities";
export * from "./links";
export { installDeviceAdapter } from "./runtime";

import { getDeviceAdapter } from "./runtime";
import { runtimeCapability, unavailableCapability } from "./capabilities";
import {
  DeviceError,
  type DevicePickPhotosOptions,
  type DeviceTakePhotoOptions,
  type DeviceClipboardOperation,
  type DeviceDocumentOperation,
  type DevicePickDocumentsOptions,
  type DeviceWriteDocumentOptions,
  type DeviceHapticImpactStyle,
  type DeviceHapticNotificationType,
  type DeviceKeyboardState,
  type DeviceLocationEvent,
  type DeviceLocationOptions,
  type DeviceLocationPermissionOptions,
  type DeviceLocationWatchOptions,
  type DeviceLocalNotification,
  type DeviceLocalNotificationAction,
  type DevicePushNotification,
  type DevicePushNotificationAction,
  type DeviceScheduleLocalNotification,
  type DeviceShareContent,
  type DeviceSubscription,
  type DeviceSystemBar,
  type DeviceSystemBarAppearance,
  type DeviceSystemBarsOperation,
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

const requireOptional = <T>(value: T | undefined, capability: string): T => {
  if (value !== undefined) return value;
  throw new DeviceError(
    "unsupported",
    `${capability} is not installed for this runtime.`,
  );
};

const requireGrantedLocation = async () => {
  const capability = requireOptional(getDeviceAdapter().location, "Location");
  const permission = await capability.queryPermission();
  if (permission.state !== "granted")
    throw new DeviceError(
      permission.state === "unavailable"
        ? "unavailable"
        : permission.state === "blocked"
          ? "permission-blocked"
          : permission.state === "denied"
            ? "permission-denied"
            : "permission-required",
      "Location permission must be granted with location.requestPermission() before reading a position.",
    );

  return capability;
};

const requireGrantedLocalNotifications = async () => {
  const capability = requireOptional(
    getDeviceAdapter().localNotifications,
    "Local notifications",
  );
  const permission = await capability.queryPermission();
  if (permission.state !== "granted")
    throw new DeviceError(
      permission.state === "unavailable"
        ? "unavailable"
        : permission.state === "blocked"
          ? "permission-blocked"
          : permission.state === "denied"
            ? "permission-denied"
            : "permission-required",
      "Notification permission must be granted with localNotifications.requestPermission() before scheduling.",
    );

  return capability;
};

export const camera = {
  capability: () =>
    getDeviceAdapter().camera?.capability() ??
    Promise.resolve(unavailableOptional("Camera")),
  permission: () =>
    requireOptional(getDeviceAdapter().camera, "Camera").queryPermission(),
  requestPermission: () =>
    requireOptional(getDeviceAdapter().camera, "Camera").requestPermission(),
  takePhoto: async (options?: DeviceTakePhotoOptions) => {
    const capability = requireOptional(getDeviceAdapter().camera, "Camera");
    const permission = await capability.queryPermission();
    if (permission.state !== "granted")
      throw new DeviceError(
        permission.state === "unavailable"
          ? "unavailable"
          : permission.state === "blocked"
            ? "permission-blocked"
            : permission.state === "denied"
              ? "permission-denied"
              : "permission-required",
        "Camera permission must be granted with camera.requestPermission() before taking a photo.",
      );
    return capability.takePhoto(options);
  },
};

export const photos = {
  capability: () =>
    getDeviceAdapter().photos?.capability() ??
    Promise.resolve(unavailableOptional("Photo picker")),
  pick: (options?: DevicePickPhotosOptions) =>
    requireOptional(getDeviceAdapter().photos, "Photo picker").pick(options),
};

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

export const documents = {
  capability: (operation?: DeviceDocumentOperation) =>
    getDeviceAdapter().documents?.capability(operation) ??
    Promise.resolve(unavailableOptional("Documents")),
  export: (options: DeviceWriteDocumentOptions) =>
    requireOptional(getDeviceAdapter().documents, "Documents").export(options),
  open: (options: DeviceWriteDocumentOptions) =>
    requireOptional(getDeviceAdapter().documents, "Documents").open(options),
  pick: (options?: DevicePickDocumentsOptions) =>
    requireOptional(getDeviceAdapter().documents, "Documents").pick(options),
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

export const keyboard = {
  capability: () =>
    getDeviceAdapter().keyboard?.capability() ??
    Promise.resolve(unavailableOptional("Keyboard")),
  dismiss: () =>
    requireOptional(getDeviceAdapter().keyboard, "Keyboard").dismiss(),
  getState: () =>
    requireOptional(getDeviceAdapter().keyboard, "Keyboard").getState(),
  onChange: (listener: (state: DeviceKeyboardState) => void) =>
    requireOptional(getDeviceAdapter().keyboard, "Keyboard").onChange(listener),
  state: () =>
    requireOptional(getDeviceAdapter().keyboard, "Keyboard").getState(),
};

export const localNotifications = {
  cancel: (ids: number[]) =>
    requireOptional(
      getDeviceAdapter().localNotifications,
      "Local notifications",
    ).cancel(ids),
  capability: () =>
    getDeviceAdapter().localNotifications?.capability() ??
    Promise.resolve(unavailableOptional("Local notifications")),
  onAction: (listener: (action: DeviceLocalNotificationAction) => void) =>
    requireOptional(
      getDeviceAdapter().localNotifications,
      "Local notifications",
    ).onAction(listener),
  onReceived: (listener: (notification: DeviceLocalNotification) => void) =>
    requireOptional(
      getDeviceAdapter().localNotifications,
      "Local notifications",
    ).onReceived(listener),
  pending: () =>
    requireOptional(
      getDeviceAdapter().localNotifications,
      "Local notifications",
    ).pending(),
  permission: () =>
    requireOptional(
      getDeviceAdapter().localNotifications,
      "Local notifications",
    ).queryPermission(),
  requestPermission: () =>
    requireOptional(
      getDeviceAdapter().localNotifications,
      "Local notifications",
    ).requestPermission(),
  schedule: async (notification: DeviceScheduleLocalNotification) =>
    (await requireGrantedLocalNotifications()).schedule(notification),
};

export const pushNotifications = {
  capability: () =>
    getDeviceAdapter().pushNotifications?.capability() ??
    Promise.resolve(unavailableOptional("Push notifications")),
  disable: () =>
    requireOptional(
      getDeviceAdapter().pushNotifications,
      "Push notifications",
    ).disable(),
  enable: async () => {
    const capability = requireOptional(
      getDeviceAdapter().pushNotifications,
      "Push notifications",
    );
    const current = await capability.queryPermission();
    const permission =
      current.state === "prompt"
        ? await capability.requestPermission()
        : current;
    if (permission.state !== "granted")
      throw new DeviceError(
        permission.state === "unavailable"
          ? "unavailable"
          : permission.state === "blocked"
            ? "permission-blocked"
            : permission.state === "denied"
              ? "permission-denied"
              : "permission-required",
        "Notification permission must be explicitly granted before enabling push notifications.",
      );
    return capability.enable();
  },
  onAction: (listener: (action: DevicePushNotificationAction) => void) =>
    requireOptional(
      getDeviceAdapter().pushNotifications,
      "Push notifications",
    ).onAction(listener),
  onReceived: (listener: (notification: DevicePushNotification) => void) =>
    requireOptional(
      getDeviceAdapter().pushNotifications,
      "Push notifications",
    ).onReceived(listener),
  permission: () =>
    requireOptional(
      getDeviceAdapter().pushNotifications,
      "Push notifications",
    ).queryPermission(),
  requestPermission: () =>
    requireOptional(
      getDeviceAdapter().pushNotifications,
      "Push notifications",
    ).requestPermission(),
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

export const location = {
  capability: () =>
    getDeviceAdapter().location?.capability() ??
    Promise.resolve(unavailableOptional("Location")),
  current: async (options?: DeviceLocationOptions) =>
    (await requireGrantedLocation()).current(options),
  permission: () =>
    requireOptional(getDeviceAdapter().location, "Location").queryPermission(),
  requestPermission: (options?: DeviceLocationPermissionOptions) =>
    requireOptional(getDeviceAdapter().location, "Location").requestPermission(
      options,
    ),
  watch: async (
    listener: (event: DeviceLocationEvent) => void,
    options?: DeviceLocationWatchOptions,
  ) => (await requireGrantedLocation()).watch(listener, options),
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

export const systemBars = {
  capability: (operation?: DeviceSystemBarsOperation) =>
    getDeviceAdapter().systemBars?.capability(operation) ??
    Promise.resolve(unavailableOptional("System bars")),
  setAppearance: (
    appearance: DeviceSystemBarAppearance,
    bar?: DeviceSystemBar,
  ) =>
    requireOptional(getDeviceAdapter().systemBars, "System bars").setAppearance(
      appearance,
      bar,
    ),
  setVisible: (visible: boolean, bar?: DeviceSystemBar) =>
    requireOptional(getDeviceAdapter().systemBars, "System bars").setVisible(
      visible,
      bar,
    ),
};
