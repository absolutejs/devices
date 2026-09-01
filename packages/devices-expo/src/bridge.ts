import {
  DeviceError,
  installDeviceAdapter,
  type DeviceAdapter,
  type DeviceDocument,
  type DeviceLocationEvent,
  type DevicePhoto,
  type DeviceSubscription,
} from "@absolutejs/devices";

const CHUNK_BYTES = 24 * 1024;
const MAX_TRANSFER_BYTES = 64 * 1024 * 1024;

export type ExpoDevicesBridgeEvent = (
  event: string,
  payload: Record<string, unknown>,
) => void;

export type ExpoDevicesBridgeTransport = {
  on(
    event: string,
    listener: (payload: Record<string, unknown>) => void,
  ): DeviceSubscription;
  request(method: string, params: Record<string, unknown>): Promise<unknown>;
};

type Transfer = { blob: Blob; expiresAt: number };
type Upload = {
  chunks: Uint8Array[];
  mimeType: string;
  name: string;
  received: number;
  size: number;
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1)
    binary += String.fromCharCode(bytes[index]!);
  return btoa(binary);
};

const base64ToBytes = (source: string) => {
  const binary = atob(source);
  return Uint8Array.from(binary, (value) => value.charCodeAt(0));
};

const record = (value: unknown, message: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError(message);
  return value as Record<string, unknown>;
};

const text = (value: unknown, field: string) => {
  if (typeof value !== "string" || !value)
    throw new TypeError(`${field} must be a non-empty string.`);
  return value;
};

const integer = (value: unknown, field: string, maximum = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > maximum)
    throw new TypeError(`${field} must be a bounded non-negative integer.`);
  return Number(value);
};

const publicValue = (value: unknown, depth = 0): unknown => {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === undefined) return undefined;
  if (depth >= 12)
    throw new DeviceError("failed", "Device bridge value is nested too deeply.");
  if (value instanceof Error)
    return {
      ...(value instanceof DeviceError ? { code: value.code } : {}),
      message: value.message,
      name: value.name,
    };
  if (Array.isArray(value))
    return value.map((entry) => publicValue(entry, depth + 1));
  if (typeof value === "object") {
    if (value instanceof Blob)
      throw new DeviceError("failed", "Binary device data must use a bounded transfer.");
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key === "native" || key === "__proto__" || key === "constructor")
        continue;
      const next = publicValue(entry, depth + 1);
      if (next !== undefined) result[key] = next;
    }
    return result;
  }
  throw new DeviceError("failed", "Device bridge value is not serializable.");
};

const requireCapability = <K extends keyof DeviceAdapter>(
  adapter: DeviceAdapter,
  capability: K,
): NonNullable<DeviceAdapter[K]> => {
  const value = adapter[capability];
  if (!value)
    throw new DeviceError(
      "unsupported",
      `Device capability ${String(capability)} is not installed.`,
    );
  return value as NonNullable<DeviceAdapter[K]>;
};

const photoDescriptor = async (
  value: DevicePhoto,
  addTransfer: (blob: Blob) => string,
) => {
  const response = await fetch(value.webPath);
  if (!response.ok)
    throw new DeviceError("failed", "The native photo could not be read.");
  const blob = await response.blob();
  if (blob.size > MAX_TRANSFER_BYTES)
    throw new DeviceError("failed", "The native photo exceeds 64 MiB.");
  return {
    ...value,
    transferId: addTransfer(blob),
    webPath: undefined,
  };
};

export const createExpoDevicesBridgeHost = async (
  adapter: DeviceAdapter,
  emit: ExpoDevicesBridgeEvent,
) => {
  const transfers = new Map<string, Transfer>();
  const uploads = new Map<string, Upload>();
  const watches = new Map<string, DeviceSubscription>();
  const listeners: DeviceSubscription[] = [];
  const addTransfer = (blob: Blob) => {
    const id = crypto.randomUUID();
    transfers.set(id, { blob, expiresAt: Date.now() + 60_000 });
    return id;
  };
  const emitSafe = (event: string, payload: unknown) =>
    emit(
      event,
      record(publicValue(payload), "Device event payload must be an object."),
    );
  const listen = async (
    operation: (() => Promise<DeviceSubscription>) | undefined,
  ) => {
    if (operation) listeners.push(await operation());
  };

  await Promise.all([
    listen(() =>
      adapter.lifecycle.onChange((state) =>
        emit("devices.lifecycle.change", { state }),
      ),
    ),
    listen(
      adapter.lifecycle.onResume
        ? () =>
            adapter.lifecycle.onResume!(() =>
              emit("devices.lifecycle.resume", {}),
            )
        : undefined,
    ),
    listen(() =>
      adapter.links.onOpen((url) => emit("devices.links.open", { url })),
    ),
    listen(() =>
      adapter.network.onChange((status) =>
        emit("devices.network.change", { status }),
      ),
    ),
    listen(
      adapter.back
        ? () =>
            adapter.back!.onPress((event) =>
              emitSafe("devices.back.press", event),
            )
        : undefined,
    ),
    listen(
      adapter.keyboard
        ? () =>
            adapter.keyboard!.onChange((state) =>
              emit("devices.keyboard.change", { state }),
            )
        : undefined,
    ),
    listen(
      adapter.localNotifications
        ? () =>
            adapter.localNotifications!.onAction((action) =>
              emitSafe("devices.localNotifications.action", action),
            )
        : undefined,
    ),
    listen(
      adapter.localNotifications
        ? () =>
            adapter.localNotifications!.onReceived((notification) =>
              emitSafe("devices.localNotifications.received", notification),
            )
        : undefined,
    ),
    listen(
      adapter.pushNotifications
        ? () =>
            adapter.pushNotifications!.onAction((action) =>
              emitSafe("devices.pushNotifications.action", action),
            )
        : undefined,
    ),
    listen(
      adapter.pushNotifications
        ? () =>
            adapter.pushNotifications!.onReceived((notification) =>
              emitSafe("devices.pushNotifications.received", notification),
            )
        : undefined,
    ),
  ]);

  const request = async (method: string, raw: Record<string, unknown>) => {
    const params = record(raw, "Device bridge params must be an object.");
    switch (method) {
      case "devices.platform.getInfo":
        return adapter.platform.getInfo();
      case "devices.lifecycle.getState":
        return adapter.lifecycle.getState();
      case "devices.links.getLaunchUrl":
        return adapter.links.getLaunchUrl();
      case "devices.links.openExternal":
        return adapter.links.openExternal(text(params.url, "url"));
      case "devices.network.getStatus":
        return adapter.network.getStatus();
      case "devices.storage.clear":
        return adapter.storage.clear();
      case "devices.storage.get":
        return adapter.storage.get(text(params.key, "key"));
      case "devices.storage.keys":
        return adapter.storage.keys();
      case "devices.storage.remove":
        return adapter.storage.remove(text(params.key, "key"));
      case "devices.storage.set":
        return adapter.storage.set(
          text(params.key, "key"),
          typeof params.value === "string"
            ? params.value
            : (() => {
                throw new TypeError("value must be a string.");
              })(),
        );
      case "devices.back.capability":
        return requireCapability(adapter, "back").capability();
      case "devices.clipboard.capability":
        return requireCapability(adapter, "clipboard").capability(
          params.operation as "read" | "write" | undefined,
        );
      case "devices.clipboard.readText":
        return requireCapability(adapter, "clipboard").readText();
      case "devices.clipboard.writeText":
        return requireCapability(adapter, "clipboard").writeText(
          typeof params.value === "string"
            ? params.value
            : (() => {
                throw new TypeError("value must be a string.");
              })(),
        );
      case "devices.share.capability":
        return requireCapability(adapter, "share").capability(
          params.content as never,
        );
      case "devices.share.share":
        return requireCapability(adapter, "share").share(
          record(params.content, "Share content must be an object."),
        );
      case "devices.haptics.capability":
        return requireCapability(adapter, "haptics").capability();
      case "devices.haptics.impact":
        return requireCapability(adapter, "haptics").impact(params.style as never);
      case "devices.haptics.notification":
        return requireCapability(adapter, "haptics").notification(params.type as never);
      case "devices.haptics.selectionChanged":
        return requireCapability(adapter, "haptics").selectionChanged();
      case "devices.haptics.vibrate":
        return requireCapability(adapter, "haptics").vibrate(
          params.durationMs as number | undefined,
        );
      case "devices.keyboard.capability":
        return requireCapability(adapter, "keyboard").capability();
      case "devices.keyboard.dismiss":
        return requireCapability(adapter, "keyboard").dismiss();
      case "devices.keyboard.getState":
        return requireCapability(adapter, "keyboard").getState();
      case "devices.systemBars.capability":
        return requireCapability(adapter, "systemBars").capability(
          params.operation as never,
        );
      case "devices.systemBars.setAppearance":
        return requireCapability(adapter, "systemBars").setAppearance(
          params.appearance as never,
          params.bar as never,
        );
      case "devices.systemBars.setVisible":
        return requireCapability(adapter, "systemBars").setVisible(
          Boolean(params.visible),
          params.bar as never,
        );
      case "devices.camera.capability":
        return requireCapability(adapter, "camera").capability();
      case "devices.camera.queryPermission":
        return requireCapability(adapter, "camera").queryPermission();
      case "devices.camera.requestPermission":
        return requireCapability(adapter, "camera").requestPermission();
      case "devices.camera.takePhoto":
        return photoDescriptor(
          await requireCapability(adapter, "camera").takePhoto(
            params.options as never,
          ),
          addTransfer,
        );
      case "devices.photos.capability":
        return requireCapability(adapter, "photos").capability();
      case "devices.photos.pick":
        return Promise.all(
          (
            await requireCapability(adapter, "photos").pick(
              params.options as never,
            )
          ).map((value) => photoDescriptor(value, addTransfer)),
        );
      case "devices.location.capability":
        return requireCapability(adapter, "location").capability();
      case "devices.location.current":
        return requireCapability(adapter, "location").current(
          params.options as never,
        );
      case "devices.location.queryPermission":
        return requireCapability(adapter, "location").queryPermission();
      case "devices.location.requestPermission":
        return requireCapability(adapter, "location").requestPermission(
          params.options as never,
        );
      case "devices.location.watch.start": {
        const id = crypto.randomUUID();
        const stop = await requireCapability(adapter, "location").watch(
          (event) => emitSafe("devices.location.watch", { event, id }),
          params.options as never,
        );
        watches.set(id, stop);
        return { id };
      }
      case "devices.location.watch.stop": {
        const id = text(params.id, "id");
        const stop = watches.get(id);
        watches.delete(id);
        await stop?.();
        return null;
      }
      case "devices.localNotifications.capability":
        return requireCapability(adapter, "localNotifications").capability();
      case "devices.localNotifications.queryPermission":
        return requireCapability(adapter, "localNotifications").queryPermission();
      case "devices.localNotifications.requestPermission":
        return requireCapability(adapter, "localNotifications").requestPermission();
      case "devices.localNotifications.schedule":
        return requireCapability(adapter, "localNotifications").schedule(
          params.notification as never,
        );
      case "devices.localNotifications.pending":
        return requireCapability(adapter, "localNotifications").pending();
      case "devices.localNotifications.cancel":
        return requireCapability(adapter, "localNotifications").cancel(
          Array.isArray(params.ids) ? params.ids.map(Number) : [],
        );
      case "devices.pushNotifications.capability":
        return requireCapability(adapter, "pushNotifications").capability();
      case "devices.pushNotifications.queryPermission":
        return requireCapability(adapter, "pushNotifications").queryPermission();
      case "devices.pushNotifications.requestPermission":
        return requireCapability(adapter, "pushNotifications").requestPermission();
      case "devices.pushNotifications.enable":
        return requireCapability(adapter, "pushNotifications").enable();
      case "devices.pushNotifications.disable":
        return requireCapability(adapter, "pushNotifications").disable();
      case "devices.documents.capability":
        return requireCapability(adapter, "documents").capability(
          params.operation as never,
        );
      case "devices.documents.pick":
        return Promise.all(
          (
            await requireCapability(adapter, "documents").pick(
              params.options as never,
            )
          ).map(async (value) => ({
            ...value,
            blob: undefined,
            transferId: addTransfer(value.blob),
          })),
        );
      case "devices.transfer.read": {
        const id = text(params.id, "id");
        const transfer = transfers.get(id);
        if (!transfer || transfer.expiresAt < Date.now()) {
          transfers.delete(id);
          throw new DeviceError("unavailable", "Device transfer expired.");
        }
        const offset = integer(params.offset, "offset", transfer.blob.size);
        const length = integer(params.length, "length", CHUNK_BYTES);
        const bytes = new Uint8Array(
          await transfer.blob.slice(offset, offset + length).arrayBuffer(),
        );
        return {
          data: bytesToBase64(bytes),
          done: offset + bytes.byteLength >= transfer.blob.size,
          size: transfer.blob.size,
          type: transfer.blob.type,
        };
      }
      case "devices.transfer.close":
        transfers.delete(text(params.id, "id"));
        return null;
      case "devices.upload.begin": {
        const size = integer(params.size, "size", MAX_TRANSFER_BYTES);
        const id = crypto.randomUUID();
        uploads.set(id, {
          chunks: [],
          mimeType:
            typeof params.mimeType === "string" ? params.mimeType : "application/octet-stream",
          name: text(params.name, "name"),
          received: 0,
          size,
        });
        return { id };
      }
      case "devices.upload.write": {
        const id = text(params.id, "id");
        const upload = uploads.get(id);
        if (!upload) throw new DeviceError("unavailable", "Device upload expired.");
        const bytes = base64ToBytes(text(params.data, "data"));
        if (bytes.byteLength > CHUNK_BYTES || upload.received + bytes.byteLength > upload.size)
          throw new TypeError("Device upload chunk is invalid.");
        upload.chunks.push(bytes);
        upload.received += bytes.byteLength;
        return { received: upload.received };
      }
      case "devices.documents.export":
      case "devices.documents.open": {
        const id = text(params.uploadId, "uploadId");
        const upload = uploads.get(id);
        uploads.delete(id);
        if (!upload || upload.received !== upload.size)
          throw new DeviceError("failed", "Device document upload is incomplete.");
        const blob = new Blob(
          upload.chunks.map((chunk) => Uint8Array.from(chunk).buffer as ArrayBuffer),
          { type: upload.mimeType },
        );
        const options = {
          content: blob,
          maximumBytes: MAX_TRANSFER_BYTES,
          mimeType: upload.mimeType,
          name: upload.name,
        };
        return method.endsWith("export")
          ? requireCapability(adapter, "documents").export(options)
          : requireCapability(adapter, "documents").open(options);
      }
      default:
        throw new DeviceError("unsupported", `Device bridge method ${method} is not allowed.`);
    }
  };

  return {
    close: async () => {
      await Promise.allSettled([
        ...listeners.map((stop) => stop()),
        ...watches.values().map((stop) => stop()),
      ]);
      listeners.length = 0;
      watches.clear();
      transfers.clear();
      uploads.clear();
    },
    request: async (method: string, params: Record<string, unknown>) =>
      publicValue(await request(method, params)),
  };
};

const remote = async <T>(
  transport: ExpoDevicesBridgeTransport,
  method: string,
  params: Record<string, unknown> = {},
) => (await transport.request(method, params)) as T;

const download = async (
  transport: ExpoDevicesBridgeTransport,
  descriptor: Record<string, unknown>,
) => {
  const id = text(descriptor.transferId, "transferId");
  const chunks: Uint8Array[] = [];
  let offset = 0;
  try {
    for (;;) {
      const result = await remote<{
        data: string;
        done: boolean;
        size: number;
        type: string;
      }>(transport, "devices.transfer.read", {
        id,
        length: CHUNK_BYTES,
        offset,
      });
      const bytes = base64ToBytes(result.data);
      chunks.push(bytes);
      offset += bytes.byteLength;
      if (result.done) {
        const blob = new Blob(
          chunks.map((chunk) => Uint8Array.from(chunk).buffer as ArrayBuffer),
          { type: result.type },
        );
        if (blob.size !== result.size)
          throw new DeviceError("failed", "Device transfer size did not match.");
        return blob;
      }
    }
  } finally {
    await transport.request("devices.transfer.close", { id }).catch(() => undefined);
  }
};

const upload = async (
  transport: ExpoDevicesBridgeTransport,
  content: Blob | string,
  name: string,
  mimeType?: string,
) => {
  const blob =
    typeof content === "string"
      ? new Blob([content], { type: mimeType ?? "text/plain" })
      : content;
  if (blob.size > MAX_TRANSFER_BYTES)
    throw new DeviceError("failed", "Device document exceeds 64 MiB.");
  const { id } = await remote<{ id: string }>(transport, "devices.upload.begin", {
    mimeType: mimeType ?? blob.type,
    name,
    size: blob.size,
  });
  for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
    const bytes = new Uint8Array(
      await blob.slice(offset, offset + CHUNK_BYTES).arrayBuffer(),
    );
    await transport.request("devices.upload.write", {
      data: bytesToBase64(bytes),
      id,
    });
  }
  return id;
};

const bridgedPhoto = async (
  transport: ExpoDevicesBridgeTransport,
  value: Record<string, unknown>,
): Promise<DevicePhoto> => {
  const blob = await download(transport, value);
  const webPath = URL.createObjectURL(blob);
  return {
    ...(typeof value.format === "string" ? { format: value.format } : {}),
    ...(typeof value.height === "number" ? { height: value.height } : {}),
    ...(typeof value.name === "string" ? { name: value.name } : {}),
    sizeBytes: blob.size,
    uri: webPath,
    webPath,
    ...(typeof value.width === "number" ? { width: value.width } : {}),
  };
};

export const createExpoWebViewDeviceAdapter = (
  transport: ExpoDevicesBridgeTransport,
  capabilities: readonly string[],
): DeviceAdapter => {
  const has = (name: string) => capabilities.includes(name);
  const on = <T>(event: string, listener: (value: T) => void) =>
    Promise.resolve(
      transport.on(event, (payload) => listener(payload as T)),
    );
  const adapter: DeviceAdapter = {
    runtime: "expo",
    platform: {
      getInfo: () => remote(transport, "devices.platform.getInfo"),
    },
    lifecycle: {
      getState: () => remote(transport, "devices.lifecycle.getState"),
      onChange: (listener) =>
        on<{ state: Parameters<typeof listener>[0] }>(
          "devices.lifecycle.change",
          ({ state }) => listener(state),
        ),
      onResume: (listener) => on("devices.lifecycle.resume", listener),
    },
    links: {
      getLaunchUrl: () => remote(transport, "devices.links.getLaunchUrl"),
      onOpen: (listener) =>
        on<{ url: string }>("devices.links.open", ({ url }) => listener(url)),
      openExternal: (url) =>
        remote(transport, "devices.links.openExternal", { url }),
    },
    network: {
      getStatus: () => remote(transport, "devices.network.getStatus"),
      onChange: (listener) =>
        on<{ status: Parameters<typeof listener>[0] }>(
          "devices.network.change",
          ({ status }) => listener(status),
        ),
    },
    storage: {
      clear: () => remote(transport, "devices.storage.clear"),
      get: (key) => remote(transport, "devices.storage.get", { key }),
      keys: () => remote(transport, "devices.storage.keys"),
      remove: (key) => remote(transport, "devices.storage.remove", { key }),
      set: (key, value) =>
        remote(transport, "devices.storage.set", { key, value }),
    },
  };
  if (has("clipboard"))
    adapter.clipboard = {
      capability: (operation) =>
        remote(transport, "devices.clipboard.capability", { operation }),
      readText: () => remote(transport, "devices.clipboard.readText"),
      writeText: (value) =>
        remote(transport, "devices.clipboard.writeText", { value }),
    };
  if (has("share"))
    adapter.share = {
      capability: (content) =>
        remote(transport, "devices.share.capability", { content }),
      share: (content) => remote(transport, "devices.share.share", { content }),
    };
  if (has("haptics"))
    adapter.haptics = {
      capability: () => remote(transport, "devices.haptics.capability"),
      impact: (style) => remote(transport, "devices.haptics.impact", { style }),
      notification: (type) =>
        remote(transport, "devices.haptics.notification", { type }),
      selectionChanged: () =>
        remote(transport, "devices.haptics.selectionChanged"),
      vibrate: (durationMs) =>
        remote(transport, "devices.haptics.vibrate", { durationMs }),
    };
  if (has("keyboard"))
    adapter.keyboard = {
      capability: () => remote(transport, "devices.keyboard.capability"),
      dismiss: () => remote(transport, "devices.keyboard.dismiss"),
      getState: () => remote(transport, "devices.keyboard.getState"),
      onChange: (listener) =>
        on<{ state: Parameters<typeof listener>[0] }>(
          "devices.keyboard.change",
          ({ state }) => listener(state),
        ),
    };
  if (has("systemBars"))
    adapter.systemBars = {
      capability: (operation) =>
        remote(transport, "devices.systemBars.capability", { operation }),
      setAppearance: (appearance, bar) =>
        remote(transport, "devices.systemBars.setAppearance", { appearance, bar }),
      setVisible: (visible, bar) =>
        remote(transport, "devices.systemBars.setVisible", { bar, visible }),
    };
  if (has("camera"))
    adapter.camera = {
      capability: () => remote(transport, "devices.camera.capability"),
      queryPermission: () => remote(transport, "devices.camera.queryPermission"),
      requestPermission: () =>
        remote(transport, "devices.camera.requestPermission"),
      takePhoto: async (options) =>
        bridgedPhoto(
          transport,
          await remote(transport, "devices.camera.takePhoto", { options }),
        ),
    };
  if (has("photos"))
    adapter.photos = {
      capability: () => remote(transport, "devices.photos.capability"),
      pick: async (options) =>
        Promise.all(
          (
            await remote<Record<string, unknown>[]>(
              transport,
              "devices.photos.pick",
              { options },
            )
          ).map((value) => bridgedPhoto(transport, value)),
        ),
    };
  if (has("location"))
    adapter.location = {
      capability: () => remote(transport, "devices.location.capability"),
      current: (options) =>
        remote(transport, "devices.location.current", { options }),
      queryPermission: () =>
        remote(transport, "devices.location.queryPermission"),
      requestPermission: (options) =>
        remote(transport, "devices.location.requestPermission", { options }),
      watch: async (listener, options) => {
        const { id } = await remote<{ id: string }>(
          transport,
          "devices.location.watch.start",
          { options },
        );
        const unsubscribe = transport.on("devices.location.watch", (payload) => {
          if (payload.id === id) listener(payload.event as DeviceLocationEvent);
        });
        return async () => {
          await unsubscribe();
          await transport.request("devices.location.watch.stop", { id });
        };
      },
    };
  if (has("localNotifications"))
    adapter.localNotifications = {
      capability: () =>
        remote(transport, "devices.localNotifications.capability"),
      cancel: (ids) =>
        remote(transport, "devices.localNotifications.cancel", { ids }),
      onAction: (listener) =>
        on("devices.localNotifications.action", listener),
      onReceived: (listener) =>
        on("devices.localNotifications.received", listener),
      pending: () => remote(transport, "devices.localNotifications.pending"),
      queryPermission: () =>
        remote(transport, "devices.localNotifications.queryPermission"),
      requestPermission: () =>
        remote(transport, "devices.localNotifications.requestPermission"),
      schedule: (notification) =>
        remote(transport, "devices.localNotifications.schedule", { notification }),
    };
  if (has("pushNotifications"))
    adapter.pushNotifications = {
      capability: () =>
        remote(transport, "devices.pushNotifications.capability"),
      disable: () => remote(transport, "devices.pushNotifications.disable"),
      enable: () => remote(transport, "devices.pushNotifications.enable"),
      onAction: (listener) =>
        on("devices.pushNotifications.action", listener),
      onReceived: (listener) =>
        on("devices.pushNotifications.received", listener),
      queryPermission: () =>
        remote(transport, "devices.pushNotifications.queryPermission"),
      requestPermission: () =>
        remote(transport, "devices.pushNotifications.requestPermission"),
    };
  if (has("documents"))
    adapter.documents = {
      capability: (operation) =>
        remote(transport, "devices.documents.capability", { operation }),
      export: async (options) => {
        const uploadId = await upload(
          transport,
          options.content,
          options.name,
          options.mimeType,
        );
        return remote(transport, "devices.documents.export", { uploadId });
      },
      open: async (options) => {
        const uploadId = await upload(
          transport,
          options.content,
          options.name,
          options.mimeType,
        );
        await remote(transport, "devices.documents.open", { uploadId });
      },
      pick: async (options) =>
        Promise.all(
          (
            await remote<Record<string, unknown>[]>(
              transport,
              "devices.documents.pick",
              { options },
            )
          ).map(async (value): Promise<DeviceDocument> => ({
            blob: await download(transport, value),
            ...(typeof value.lastModifiedMs === "number"
              ? { lastModifiedMs: value.lastModifiedMs }
              : {}),
            mimeType: text(value.mimeType, "mimeType"),
            name: text(value.name, "name"),
            sizeBytes: integer(value.sizeBytes, "sizeBytes", MAX_TRANSFER_BYTES),
          })),
        ),
    };
  return adapter;
};

export const installExpoWebViewDeviceAdapter = (
  transport: ExpoDevicesBridgeTransport,
  capabilities: readonly string[],
) => installDeviceAdapter(createExpoWebViewDeviceAdapter(transport, capabilities));
