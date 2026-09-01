import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import * as Device from "expo-device";
import * as Linking from "expo-linking";
import { getLocales } from "expo-localization";
import * as Network from "expo-network";
import {
  AccessibilityInfo,
  AppState,
  BackHandler,
  Platform,
} from "react-native";
import {
  availableCapability,
  installDeviceAdapter,
  normalizeDeviceError,
  unavailableCapability,
  type DeviceAdapter,
  type DeviceCameraCapability,
  type DeviceClipboardCapability,
  type DeviceDocumentsCapability,
  type DeviceHapticsCapability,
  type DeviceKeyboardCapability,
  type DeviceLifecycleState,
  type DeviceLocalNotificationsCapability,
  type DeviceLocationCapability,
  type DeviceNetworkStatus,
  type DevicePhotosCapability,
  type DevicePushNotificationsCapability,
  type DeviceShareCapability,
  type DeviceSystemBarsCapability,
} from "@absolutejs/devices";
import { removable, safeExternalUrl } from "./common";

const DEFAULT_STORAGE_PREFIX = "absolutejs.devices.";

export type ExpoDeviceAdapterOptions = {
  camera?: DeviceCameraCapability;
  clipboard?: DeviceClipboardCapability;
  documents?: DeviceDocumentsCapability;
  haptics?: DeviceHapticsCapability;
  keyboard?: DeviceKeyboardCapability;
  localNotifications?: DeviceLocalNotificationsCapability;
  location?: DeviceLocationCapability;
  photos?: DevicePhotosCapability;
  pushNotifications?: DevicePushNotificationsCapability;
  share?: DeviceShareCapability;
  storagePrefix?: string;
  systemBars?: DeviceSystemBarsCapability;
};

const lifecycleState = (state: string | null): DeviceLifecycleState =>
  state === "active"
    ? "active"
    : state === "inactive" || state === "unknown" || state === "extension"
      ? "inactive"
      : "background";

const networkStatus = (state: Network.NetworkState): DeviceNetworkStatus => ({
  connected: state.isConnected === true && state.isInternetReachable !== false,
  connectionType:
    state.isConnected !== true
      ? "none"
      : state.type === Network.NetworkStateType.WIFI
        ? "wifi"
        : state.type === Network.NetworkStateType.CELLULAR
          ? "cellular"
          : state.type === Network.NetworkStateType.ETHERNET
            ? "ethernet"
            : "unknown",
});

const formFactor = (): "desktop" | "phone" | "tablet" | "unknown" => {
  if (Device.deviceType === Device.DeviceType.PHONE) return "phone";
  if (Device.deviceType === Device.DeviceType.TABLET) return "tablet";
  if (Device.deviceType === Device.DeviceType.DESKTOP) return "desktop";
  return "unknown";
};

const requireStoragePrefix = (value: string) => {
  if (!value) throw new TypeError("Expo device storagePrefix cannot be empty.");
  return value;
};

const call = async <T>(message: string, operation: () => Promise<T>) => {
  try {
    return await operation();
  } catch (error) {
    throw normalizeDeviceError(error, { message });
  }
};

export const createExpoDeviceAdapter = (
  options: ExpoDeviceAdapterOptions = {},
): DeviceAdapter => {
  const prefix = requireStoragePrefix(
    options.storagePrefix ?? DEFAULT_STORAGE_PREFIX,
  );
  const key = (value: string) => `${prefix}${value}`;
  return {
    runtime: "expo",
    back: {
      capability: async () =>
        Platform.OS === "android"
          ? availableCapability("native", { platform: "android" })
          : unavailableCapability(
              "unsupported",
              "Hardware Back is available only on Android.",
            ),
      onPress: async (listener) => {
        if (Platform.OS !== "android") return () => undefined;
        const subscription = BackHandler.addEventListener(
          "hardwareBackPress",
          () => {
            listener({ canGoBack: false });
            return true;
          },
        );
        return removable(() => subscription.remove());
      },
    },
    ...(options.camera ? { camera: options.camera } : {}),
    ...(options.clipboard ? { clipboard: options.clipboard } : {}),
    ...(options.documents ? { documents: options.documents } : {}),
    ...(options.haptics ? { haptics: options.haptics } : {}),
    ...(options.keyboard ? { keyboard: options.keyboard } : {}),
    lifecycle: {
      getState: async () => lifecycleState(AppState.currentState),
      onChange: async (listener) => {
        const subscription = AppState.addEventListener("change", (state) =>
          listener(lifecycleState(state)),
        );
        return removable(() => subscription.remove());
      },
      onResume: async (listener) => {
        let previous = lifecycleState(AppState.currentState);
        const subscription = AppState.addEventListener("change", (next) => {
          const normalized = lifecycleState(next);
          if (normalized === "active" && previous !== "active") listener();
          previous = normalized;
        });
        return removable(() => subscription.remove());
      },
    },
    links: {
      getLaunchUrl: () => Linking.getInitialURL(),
      onOpen: async (listener) => {
        const subscription = Linking.addEventListener("url", ({ url }) =>
          listener(url),
        );
        return removable(() => subscription.remove());
      },
      openExternal: (url) =>
        call("Failed to open the external URL.", async () => {
          await Linking.openURL(safeExternalUrl(url));
        }),
    },
    ...(options.localNotifications
      ? { localNotifications: options.localNotifications }
      : {}),
    ...(options.location ? { location: options.location } : {}),
    network: {
      getStatus: async () =>
        networkStatus(
          await call("Failed to read native network state.", () =>
            Network.getNetworkStateAsync(),
          ),
        ),
      onChange: async (listener) => {
        const subscription = Network.addNetworkStateListener((state) =>
          listener(networkStatus(state)),
        );
        return removable(() => subscription.remove());
      },
    },
    platform: {
      getInfo: async () => {
        const locale = getLocales()[0];
        return {
          ...(Application.nativeBuildVersion
            ? { appBuild: Application.nativeBuildVersion }
            : {}),
          ...(Application.nativeApplicationVersion
            ? { appVersion: Application.nativeApplicationVersion }
            : {}),
          formFactor: formFactor(),
          isNative: Platform.OS === "android" || Platform.OS === "ios",
          ...(locale?.languageCode ? { language: locale.languageCode } : {}),
          ...(locale?.languageTag ? { locale: locale.languageTag } : {}),
          os:
            Platform.OS === "android" || Platform.OS === "ios"
              ? Platform.OS
              : "unknown",
          prefersReducedMotion: await AccessibilityInfo.isReduceMotionEnabled(),
          runtime: "expo",
        };
      },
    },
    ...(options.photos ? { photos: options.photos } : {}),
    ...(options.pushNotifications
      ? { pushNotifications: options.pushNotifications }
      : {}),
    ...(options.share ? { share: options.share } : {}),
    storage: {
      clear: async () => {
        const keys = (await AsyncStorage.getAllKeys()).filter((item) =>
          item.startsWith(prefix),
        );
        if (keys.length > 0) await AsyncStorage.multiRemove(keys);
      },
      get: (name) => AsyncStorage.getItem(key(name)),
      keys: async () =>
        (await AsyncStorage.getAllKeys())
          .filter((item) => item.startsWith(prefix))
          .map((item) => item.slice(prefix.length)),
      remove: async (name) => {
        await AsyncStorage.removeItem(key(name));
      },
      set: (name, value) => AsyncStorage.setItem(key(name), value),
    },
    ...(options.systemBars ? { systemBars: options.systemBars } : {}),
  };
};

export const installExpoDeviceAdapter = (options?: ExpoDeviceAdapterOptions) =>
  installDeviceAdapter(createExpoDeviceAdapter(options));
