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
    "../packages/devices-capacitor/dist/haptics.js",
    "createCapacitorHapticsCapability",
  ],
  [
    "../packages/devices-capacitor/dist/share.js",
    "createCapacitorShareCapability",
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
for (const optionalPlugin of ["clipboard", "haptics", "share"]) {
  if (baseAdapter.includes(`@capacitor/${optionalPlugin}`))
    throw new Error(
      `The base Capacitor adapter unexpectedly imports optional plugin @capacitor/${optionalPlugin}.`,
    );
}

console.log("All devices package public build entries are importable.");
