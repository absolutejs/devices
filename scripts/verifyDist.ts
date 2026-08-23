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
] as const;

for (const [specifier, exportedName] of entries) {
  const module = await import(specifier);
  if (!Reflect.has(module, exportedName))
    throw new Error(`${specifier} does not export ${exportedName}.`);
}

console.log("All devices package public build entries are importable.");
