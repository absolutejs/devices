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
- namespaced ordinary preferences that never clear another package's keys; and
- an Absolute-owned native credential vault backed by iOS Keychain and Android
  Keystore AES-256-GCM encryption.

`Preferences` is never used for credentials. On a native build the adapter
selects `AbsoluteSecureStorage` automatically when Capacitor has registered the
bundled plugin. Browser previews remain unavailable/fail-closed. Advanced hosts
can still pass a different audited provider through `secureStorage`.

```ts
import { installCapacitorDeviceAdapterIfNative } from "@absolutejs/devices-capacitor";

const remove = installCapacitorDeviceAdapterIfNative();
```

The conditional helper returns `null` in a browser preview, preserving the core
web adapter. AbsoluteJS owns this bootstrap call; application code normally does
not invoke it.

The JavaScript contract and native sources are tested in CI; release acceptance
still requires the real iOS/Android simulator checklist because native Keychain
and Keystore behavior cannot be proven by a browser test runner.
