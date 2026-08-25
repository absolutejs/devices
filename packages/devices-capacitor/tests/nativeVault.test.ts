import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test("native background components share the audited credential vault", async () => {
  const root = join(import.meta.dir, "..");
  const swiftPlugin = await readFile(
    join(
      root,
      "ios/Sources/AbsoluteDevicesCapacitor/AbsoluteSecureStoragePlugin.swift",
    ),
    "utf8",
  );
  const javaPlugin = await readFile(
    join(
      root,
      "android/src/main/java/js/absolute/devices/AbsoluteSecureStoragePlugin.java",
    ),
    "utf8",
  );
  const swiftVault = await readFile(
    join(
      root,
      "ios/Sources/AbsoluteDevicesCapacitor/AbsoluteSecureStorageVault.swift",
    ),
    "utf8",
  );
  const javaVault = await readFile(
    join(
      root,
      "android/src/main/java/js/absolute/devices/AbsoluteSecureStorageVault.java",
    ),
    "utf8",
  );

  expect(swiftPlugin).toContain("AbsoluteSecureStorageVault.set");
  expect(javaPlugin).toContain("AbsoluteSecureStorageVault.set");
  expect(swiftPlugin).toContain("acquireLease");
  expect(javaPlugin).toContain("acquireLease");
  expect(swiftVault).toContain(
    "kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly",
  );
  expect(swiftVault).toContain("systemUptime");
  expect(swiftVault).toContain("setIfLease");
  expect(javaVault).toContain("AES/GCM/NoPadding");
  expect(javaVault).toContain("AndroidKeyStore");
  expect(javaVault).toContain("elapsedRealtime");
  expect(javaVault).toContain("setIfLease");
});
