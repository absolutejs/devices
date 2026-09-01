const entries = [
  ["../packages/devices/dist/index.js", "platform"],
  ["../packages/devices/dist/runtime.js", "installDeviceAdapter"],
  ["../packages/devices/dist/ssr.js", "createSsrDeviceAdapter"],
  ["../packages/devices/dist/testing.js", "createTestDeviceAdapter"],
  ["../packages/devices/dist/web.js", "createWebDeviceAdapter"],
  [
    "../packages/devices-capacitor/dist/index.js",
    "createCapacitorDeviceAdapter",
  ],
  [
    "../packages/devices-capacitor/dist/index.js",
    "createCapacitorSecureStorage",
  ],
  [
    "../packages/devices-capacitor/dist/clipboard.js",
    "createCapacitorClipboardCapability",
  ],
  [
    "../packages/devices-capacitor/dist/camera.js",
    "createCapacitorCameraCapability",
  ],
  [
    "../packages/devices-capacitor/dist/haptics.js",
    "createCapacitorHapticsCapability",
  ],
  [
    "../packages/devices-capacitor/dist/keyboard.js",
    "createCapacitorKeyboardCapability",
  ],
  [
    "../packages/devices-capacitor/dist/location.js",
    "createCapacitorLocationCapability",
  ],
  [
    "../packages/devices-capacitor/dist/localNotifications.js",
    "createCapacitorLocalNotificationsCapability",
  ],
  [
    "../packages/devices-capacitor/dist/share.js",
    "createCapacitorShareCapability",
  ],
  [
    "../packages/devices-capacitor/dist/systemBars.js",
    "createCapacitorSystemBarsCapability",
  ],
] as const;

for (const [specifier, exportedName] of entries) {
  const module = await import(specifier);
  if (!Reflect.has(module, exportedName))
    throw new Error(`${specifier} does not export ${exportedName}.`);
}

// Expo/React Native is not importable in Bun's server runtime. Verify its
// production entrypoints structurally; the provider tests exercise the source.
for (const [path, exportedName] of [
  ["../packages/devices-expo/dist/index.js", "createExpoDeviceAdapter"],
  ["../packages/devices-expo/dist/bridge.js", "createExpoDevicesBridgeHost"],
  ["../packages/devices-expo/dist/camera.js", "createExpoCameraCapability"],
  ["../packages/devices-expo/dist/documents.js", "createExpoDocumentsCapability"],
  ["../packages/devices-expo/dist/location.js", "createExpoLocationCapability"],
  ["../packages/devices-expo/dist/pushNotifications.js", "createExpoPushNotificationsCapability"],
] as const) {
  const source = await Bun.file(new URL(path, import.meta.url)).text();
  if (!source.includes(exportedName))
    throw new Error(`${path} does not export ${exportedName}.`);
}

const baseAdapter = await Bun.file(
  new URL("../packages/devices-capacitor/dist/index.js", import.meta.url),
).text();
for (const optionalPlugin of [
  "camera",
  "clipboard",
  "geolocation",
  "haptics",
  "keyboard",
  "local-notifications",
  "share",
]) {
  if (baseAdapter.includes(`@capacitor/${optionalPlugin}`))
    throw new Error(
      `The base Capacitor adapter unexpectedly imports optional plugin @capacitor/${optionalPlugin}.`,
    );
}

console.log("All devices package public build entries are importable.");
