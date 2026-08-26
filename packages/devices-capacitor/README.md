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
  Keystore AES-256-GCM encryption; plus
- opt-in Clipboard, Share, and Haptics provider slices.

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

Optional capabilities are intentionally separate exports:

```ts
import { createCapacitorClipboardCapability } from "@absolutejs/devices-capacitor/clipboard";
import { createCapacitorHapticsCapability } from "@absolutejs/devices-capacitor/haptics";
import { createCapacitorShareCapability } from "@absolutejs/devices-capacitor/share";
```

The `absolutejs.devices` field in this package's `package.json` declares the
factory and exact tested Capacitor dependency for each slice. The AbsoluteJS CLI
consumes that metadata and generates these imports; users keep importing the
provider-neutral facade only. The base entry does not import these plugins.

The JavaScript contract and native sources are tested in CI; release acceptance
still requires the real iOS/Android simulator checklist because native Keychain
and Keystore behavior cannot be proven by a browser test runner.
