# AbsoluteJS Devices

Provider-neutral device capabilities for AbsoluteJS applications.

The repository publishes two deliberately separate packages:

- `@absolutejs/devices` — dependency-light contracts plus web, SSR, and test adapters.
- `@absolutejs/devices-capacitor` — Capacitor implementations selected by an AbsoluteJS mobile build.

Application code imports capabilities from `@absolutejs/devices`; it does not branch on Capacitor or call vendor plugins directly. AbsoluteJS selects the runtime adapter for web, SSR, tests, and installed apps.

The adapter registry is realm-scoped rather than module-scoped. This is required
because an embedded page and the AbsoluteJS native shell can be compiled as
independent bundles while sharing one WebView global realm.

This repository does not own emulator orchestration. Target provisioning, native builds, HMR transport, and app launch are host-side responsibilities of the AbsoluteJS mobile CLI and must never enter an application bundle.

The core implementation covers platform information, lifecycle/resume/restored
operations, normalized links, network state, Android-style back events, ordinary
key/value storage, clipboard, system sharing, haptics, local notifications, a
portable keyboard/system-bars surface, and a deliberately separate
secure-storage seam. Provider features are isolated, tree-shakeable
slices: an app that never imports `clipboard`, `share`, or `haptics` does not need
the corresponding native plugin.

```ts
import {
  back,
  clipboard,
  haptics,
  keyboard,
  lifecycle,
  links,
  network,
  platform,
  secureStorage,
  share,
  systemBars,
} from "@absolutejs/devices";

const info = await platform.info();
const launchLink = await links.getLaunchLink();
const connection = await network.status();

const removeResume = await lifecycle.onResume(() => {
  // Refresh ephemeral UI. Durable application synchronization belongs to
  // @absolutejs/sync rather than the device lifecycle adapter.
});

if ((await back.capability()).available) {
  const removeBack = await back.onPress(({ canGoBack }) => {
    if (canGoBack) history.back();
  });
}

if ((await secureStorage.capability()).available) {
  await secureStorage.set("credential", "provider-owned-secret");
}

await clipboard.writeText("Copied everywhere");
await share.share({ text: "Shared everywhere", url: "https://absolutejs.com" });
await haptics.impact("light");
await keyboard.dismiss();
await systemBars.setAppearance("light", "status");
```

AbsoluteJS discovers these named application imports at mobile initialization
and reads the selected provider's declarative package metadata. It installs only
the exact native plugin packages the app uses and generates the adapter wiring;
application code never edits Capacitor bootstrap code. Capability discovery does
not request a permission or execute native code.

Sensitive permissions are never requested by importing a module or calling a
capability query. Every future permission-owning feature uses the normalized
`PermissionState` contract and exposes an explicit `requestPermission()` method
that applications call from a user action.

## Development

```bash
bun install
bun run check
```

The project is pre-1.0. Public contracts may change while the mobile runtime is being proven.

## License

Business Source License 1.1. Normal use in applications is permitted; see [LICENSE](LICENSE) for the complete terms. The code converts to Apache License 2.0 on the stated Change Date.
