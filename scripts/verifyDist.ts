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
