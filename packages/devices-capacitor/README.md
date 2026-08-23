# @absolutejs/devices-capacitor

Capacitor implementations for the provider-neutral `@absolutejs/devices`
contracts. AbsoluteJS installs this adapter in the generated mobile shell;
application code continues to import from `@absolutejs/devices`.

The release-candidate adapter covers:

- app metadata and native platform identity;
- app state, native resume, and Android restored-operation delivery;
- launch URLs, inbound links, and audited HTTP(S) external browser opening;
- native network status and change events;
- Android hardware-back events with an explicit capability check; and
- namespaced ordinary preferences that never clear another package's keys.

`Preferences` is not secure storage. A Keychain/Keystore-backed provider must be
passed explicitly through `secureStorage` before the core secure-storage facade
reports availability.

```ts
import { installCapacitorDeviceAdapterIfNative } from "@absolutejs/devices-capacitor";

const remove = installCapacitorDeviceAdapterIfNative();
```

The conditional helper returns `null` in a browser preview, preserving the core
web adapter. AbsoluteJS owns this bootstrap call; application code normally does
not invoke it.

This package is still an unpublished release candidate pending real iOS
simulator acceptance.
