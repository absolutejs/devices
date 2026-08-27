import type {
  DeviceAdapter,
  DeviceBackEvent,
  DeviceLifecycleState,
  DeviceKeyboardState,
  DeviceLocationEvent,
  DeviceLocationPosition,
  DeviceLocalNotification,
  DeviceLocalNotificationAction,
  DeviceNetworkStatus,
  DevicePermissionCapability,
  DevicePermissionStatus,
  DevicePlatformInfo,
  DeviceRestoredOperation,
  DeviceShareContent,
  DeviceShareResult,
  DevicePhoto,
  DeviceDocument,
  DeviceWriteDocumentOptions,
} from "./contracts";
import { DeviceError } from "./contracts";
import {
  availableCapability,
  normalizeDeviceLocalNotification,
} from "./capabilities";
export * from "./conformance";

export type TestDeviceController = {
  adapter: DeviceAdapter;
  emitBack(event?: DeviceBackEvent): void;
  emitLifecycle(state: DeviceLifecycleState): void;
  emitKeyboard(state: DeviceKeyboardState): void;
  emitLink(url: string): void;
  emitLocation(position?: DeviceLocationPosition): void;
  emitLocationError(error?: DeviceError): void;
  emitLocalNotification(id: number): void;
  emitLocalNotificationAction(
    id: number,
    actionId?: string,
    inputValue?: string,
  ): void;
  emitNetwork(status: DeviceNetworkStatus): void;
  emitRestoredOperation(operation: DeviceRestoredOperation): void;
  clipboardText: string;
  cameraPermission: TestPermissionController;
  hapticEvents: string[];
  keyboardState: DeviceKeyboardState;
  locationPermission: TestPermissionController;
  notificationPermission: TestPermissionController;
  locations: DeviceLocationPosition[];
  pickedPhotos: DevicePhoto[];
  pickedDocuments: DeviceDocument[];
  exportedDocuments: DeviceWriteDocumentOptions[];
  openedDocuments: DeviceWriteDocumentOptions[];
  openedExternalUrls: string[];
  pendingNotifications: DeviceLocalNotification[];
  sharedContent: DeviceShareContent[];
  secureStorage: Map<string, string>;
  storage: Map<string, string>;
  systemBarEvents: string[];
};

export type TestPermissionController = {
  permission: DevicePermissionCapability;
  readonly requests: number;
  setStatus(status: DevicePermissionStatus): void;
};

export const createTestPermission = (
  initial: DevicePermissionStatus = { canRequest: true, state: "prompt" },
  requested: DevicePermissionStatus = {
    canRequest: false,
    state: "granted",
  },
): TestPermissionController => {
  let status = initial;
  let requests = 0;
  const controller: TestPermissionController = {
    permission: {
      queryPermission: async () => status,
      requestPermission: async () => {
        requests += 1;
        status = requested;
        return status;
      },
    },
    get requests() {
      return requests;
    },
    setStatus: (next) => {
      status = next;
    },
  };

  return controller;
};

export const createTestDeviceAdapter = (
  options: {
    launchUrl?: string | null;
    lifecycle?: DeviceLifecycleState;
    network?: DeviceNetworkStatus;
    platform?: Partial<DevicePlatformInfo>;
  } = {},
): TestDeviceController => {
  let lifecycleState = options.lifecycle ?? "active";
  let networkStatus = options.network ?? {
    connected: true,
    connectionType: "wifi",
  };
  const lifecycleListeners = new Set<(state: DeviceLifecycleState) => void>();
  const resumeListeners = new Set<() => void>();
  const restoredListeners = new Set<
    (operation: DeviceRestoredOperation) => void
  >();
  const backListeners = new Set<(event: DeviceBackEvent) => void>();
  const linkListeners = new Set<(url: string) => void>();
  const networkListeners = new Set<(status: DeviceNetworkStatus) => void>();
  const locationListeners = new Set<(event: DeviceLocationEvent) => void>();
  const keyboardListeners = new Set<(state: DeviceKeyboardState) => void>();
  const notificationActionListeners = new Set<
    (action: DeviceLocalNotificationAction) => void
  >();
  const notificationReceivedListeners = new Set<
    (notification: DeviceLocalNotification) => void
  >();
  const values = new Map<string, string>();
  const secureValues = new Map<string, string>();
  const openedExternalUrls: string[] = [];
  const sharedContent: DeviceShareContent[] = [];
  const hapticEvents: string[] = [];
  const systemBarEvents: string[] = [];
  let keyboardState: DeviceKeyboardState = { heightPx: 0, visible: false };
  const cameraPermission = createTestPermission(
    { canRequest: true, state: "prompt" },
    { canRequest: false, state: "granted" },
  );
  const locationPermission = createTestPermission(
    { canRequest: true, state: "prompt" },
    { canRequest: false, state: "granted" },
  );
  const notificationPermission = createTestPermission(
    { canRequest: true, state: "prompt" },
    { canRequest: false, state: "granted" },
  );
  const pendingNotifications: DeviceLocalNotification[] = [];
  const notificationHistory = new Map<number, DeviceLocalNotification>();
  const locations: DeviceLocationPosition[] = [
    {
      accuracyMeters: 5,
      latitude: 40.7128,
      longitude: -74.006,
      timestampMs: 1_777_000_000_000,
    },
  ];
  const pickedPhotos: DevicePhoto[] = [
    {
      format: "jpeg",
      name: "test-photo.jpg",
      sizeBytes: 4,
      webPath: "test://photo/1",
    },
  ];
  const pickedDocuments: DeviceDocument[] = [
    {
      blob: new Blob(["test document"], { type: "text/plain" }),
      lastModifiedMs: 1_777_000_000_000,
      mimeType: "text/plain",
      name: "test-document.txt",
      sizeBytes: 13,
    },
  ];
  const exportedDocuments: DeviceWriteDocumentOptions[] = [];
  const openedDocuments: DeviceWriteDocumentOptions[] = [];
  let clipboardText = "";
  const adapter: DeviceAdapter = {
    runtime: "test",
    back: {
      capability: async () => availableCapability("emulated"),
      onPress: async (listener) => {
        backListeners.add(listener);
        return () => {
          backListeners.delete(listener);
        };
      },
    },
    camera: {
      capability: async () => availableCapability("emulated"),
      ...cameraPermission.permission,
      takePhoto: async () => pickedPhotos[0]!,
    },
    clipboard: {
      capability: async () => availableCapability("emulated"),
      readText: async () => clipboardText,
      writeText: async (value) => {
        clipboardText = value;
      },
    },
    documents: {
      capability: async () => availableCapability("emulated"),
      export: async (document) => {
        exportedDocuments.push(document);
        const blob =
          document.content instanceof Blob
            ? document.content
            : new Blob([document.content], {
                type: document.mimeType ?? "text/plain;charset=utf-8",
              });
        return {
          activity: "test",
          mimeType:
            document.mimeType || blob.type || "application/octet-stream",
          name: document.name,
          sizeBytes: blob.size,
        };
      },
      open: async (document) => {
        openedDocuments.push(document);
      },
      pick: async (pickOptions) =>
        pickedDocuments.slice(0, pickOptions?.limit ?? 1),
    },
    haptics: {
      capability: async () => availableCapability("emulated"),
      impact: async (style = "medium") => {
        hapticEvents.push(`impact:${style}`);
      },
      notification: async (type = "success") => {
        hapticEvents.push(`notification:${type}`);
      },
      selectionChanged: async () => {
        hapticEvents.push("selection");
      },
      vibrate: async (durationMs = 300) => {
        hapticEvents.push(`vibrate:${durationMs}`);
      },
    },
    keyboard: {
      capability: async () => availableCapability("emulated"),
      dismiss: async () => {
        keyboardState = { heightPx: 0, visible: false };
        for (const listener of keyboardListeners) listener(keyboardState);
      },
      getState: async () => keyboardState,
      onChange: async (listener) => {
        keyboardListeners.add(listener);
        return () => {
          keyboardListeners.delete(listener);
        };
      },
    },
    localNotifications: {
      cancel: async (ids) => {
        const selected = new Set(ids);
        for (
          let index = pendingNotifications.length - 1;
          index >= 0;
          index -= 1
        )
          if (selected.has(pendingNotifications[index]!.id))
            pendingNotifications.splice(index, 1);
      },
      capability: async () => availableCapability("emulated"),
      onAction: async (listener) => {
        notificationActionListeners.add(listener);
        return () => {
          notificationActionListeners.delete(listener);
        };
      },
      onReceived: async (listener) => {
        notificationReceivedListeners.add(listener);
        return () => {
          notificationReceivedListeners.delete(listener);
        };
      },
      pending: async () => [...pendingNotifications],
      queryPermission: notificationPermission.permission.queryPermission,
      requestPermission: notificationPermission.permission.requestPermission,
      schedule: async (input) => {
        const permission =
          await notificationPermission.permission.queryPermission();
        if (permission.state !== "granted")
          throw new DeviceError(
            permission.state === "denied"
              ? "permission-denied"
              : permission.state === "blocked"
                ? "permission-blocked"
                : "permission-required",
            "Notification permission must be explicitly granted before scheduling.",
          );
        const notification = normalizeDeviceLocalNotification(input);
        const existing = pendingNotifications.findIndex(
          ({ id }) => id === notification.id,
        );
        if (existing === -1) pendingNotifications.push(notification);
        else pendingNotifications.splice(existing, 1, notification);
        notificationHistory.set(notification.id, notification);
        return notification;
      },
    },
    platform: {
      getInfo: async () => ({
        formFactor: "phone",
        isNative: false,
        os: "unknown",
        prefersReducedMotion: false,
        runtime: "test",
        safeAreaInsets: { bottom: 0, left: 0, right: 0, top: 0 },
        ...options.platform,
      }),
    },
    lifecycle: {
      getState: async () => lifecycleState,
      onChange: async (listener) => {
        lifecycleListeners.add(listener);
        return () => {
          lifecycleListeners.delete(listener);
        };
      },
      onRestoredOperation: async (listener) => {
        restoredListeners.add(listener);
        return () => {
          restoredListeners.delete(listener);
        };
      },
      onResume: async (listener) => {
        resumeListeners.add(listener);
        return () => {
          resumeListeners.delete(listener);
        };
      },
    },
    links: {
      getLaunchUrl: async () => options.launchUrl ?? null,
      onOpen: async (listener) => {
        linkListeners.add(listener);
        return () => {
          linkListeners.delete(listener);
        };
      },
      openExternal: async (url) => {
        openedExternalUrls.push(url);
      },
    },
    location: {
      capability: async () => availableCapability("emulated"),
      current: async () => locations.at(-1)!,
      queryPermission: async () => ({
        ...(await locationPermission.permission.queryPermission()),
        precision: "precise",
      }),
      requestPermission: async () => ({
        ...(await locationPermission.permission.requestPermission()),
        precision: "precise",
      }),
      watch: async (listener) => {
        locationListeners.add(listener);
        return () => {
          locationListeners.delete(listener);
        };
      },
    },
    network: {
      getStatus: async () => networkStatus,
      onChange: async (listener) => {
        networkListeners.add(listener);
        return () => {
          networkListeners.delete(listener);
        };
      },
    },
    photos: {
      capability: async () => availableCapability("emulated"),
      pick: async (pickOptions) => pickedPhotos.slice(0, pickOptions?.limit),
    },
    share: {
      capability: async () => availableCapability("emulated"),
      share: async (content): Promise<DeviceShareResult> => {
        sharedContent.push(content);
        return { activity: "test" };
      },
    },
    secureStorage: {
      capability: async () => availableCapability("emulated"),
      clear: async () => secureValues.clear(),
      get: async (key) => secureValues.get(key) ?? null,
      keys: async () => [...secureValues.keys()],
      remove: async (key) => {
        secureValues.delete(key);
      },
      set: async (key, value) => {
        secureValues.set(key, value);
      },
    },
    storage: {
      clear: async () => values.clear(),
      get: async (key) => values.get(key) ?? null,
      keys: async () => [...values.keys()],
      remove: async (key) => {
        values.delete(key);
      },
      set: async (key, value) => {
        values.set(key, value);
      },
    },
    systemBars: {
      capability: async () => availableCapability("emulated"),
      setAppearance: async (appearance, bar = "all") => {
        systemBarEvents.push(`appearance:${bar}:${appearance}`);
      },
      setVisible: async (visible, bar = "all") => {
        systemBarEvents.push(`visible:${bar}:${String(visible)}`);
      },
    },
  };

  return {
    adapter,
    cameraPermission,
    get clipboardText() {
      return clipboardText;
    },
    emitBack: (event = { canGoBack: false }) => {
      for (const listener of backListeners) listener(event);
    },
    emitLifecycle: (state) => {
      lifecycleState = state;
      for (const listener of lifecycleListeners) listener(state);
      if (state === "active")
        for (const listener of resumeListeners) listener();
    },
    emitKeyboard: (state) => {
      keyboardState = state;
      for (const listener of keyboardListeners) listener(state);
    },
    emitLink: (url) => {
      for (const listener of linkListeners) listener(url);
    },
    emitLocation: (position = locations.at(-1)!) => {
      locations.push(position);
      for (const listener of locationListeners)
        listener({ position, type: "position" });
    },
    emitLocationError: (
      error = new DeviceError(
        "temporarily-unavailable",
        "Test location is unavailable.",
      ),
    ) => {
      for (const listener of locationListeners)
        listener({ error, type: "error" });
    },
    emitLocalNotification: (id) => {
      const index = pendingNotifications.findIndex(
        (notification) => notification.id === id,
      );
      const notification =
        index === -1
          ? notificationHistory.get(id)
          : pendingNotifications.splice(index, 1)[0];
      if (!notification)
        throw new Error(`Unknown test local notification ${id}.`);
      for (const listener of notificationReceivedListeners)
        listener(notification);
    },
    emitLocalNotificationAction: (id, actionId = "tap", inputValue) => {
      const notification = notificationHistory.get(id);
      if (!notification)
        throw new Error(`Unknown test local notification ${id}.`);
      const action = {
        actionId,
        ...(inputValue === undefined ? {} : { inputValue }),
        notification,
      };
      for (const listener of notificationActionListeners) listener(action);
    },
    emitNetwork: (status) => {
      networkStatus = status;
      for (const listener of networkListeners) listener(status);
    },
    emitRestoredOperation: (operation) => {
      for (const listener of restoredListeners) listener(operation);
    },
    hapticEvents,
    get keyboardState() {
      return keyboardState;
    },
    locationPermission,
    locations,
    notificationPermission,
    openedExternalUrls,
    pendingNotifications,
    exportedDocuments,
    pickedPhotos,
    pickedDocuments,
    openedDocuments,
    secureStorage: secureValues,
    sharedContent,
    storage: values,
    systemBarEvents,
  };
};
