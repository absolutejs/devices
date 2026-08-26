# Architecture

## Boundary

`@absolutejs/devices` describes user capabilities, not vendor plugins. An application asks to share, inspect connectivity, or store a value. A build-selected adapter implements that operation for the browser, SSR, Capacitor, tests, and later Expo.

The core package must remain safe to import during SSR and must not depend on Capacitor. The Capacitor package can depend on narrowly selected plugins. Future Expo dependencies belong in a third package only when the Expo runtime exists.

## Selection

AbsoluteJS injects an adapter during target bootstrap:

```text
web build       -> web adapter
server build    -> SSR adapter
Capacitor build -> Capacitor adapter
test            -> explicit in-memory adapter
```

Browser export conditions cannot distinguish a browser from a Capacitor WebView, so package conditions alone are not the selection mechanism.

The installed-adapter stack lives under a `Symbol.for` realm registry. A mobile
shell bundle and separately compiled page bundle can therefore contain distinct
copies of the core package without silently selecting different adapters. Tests
build two physical runtime bundles and verify that an installation through one
is visible through the other.

## Contract rules

- Querying support never requests permission or opens UI.
- Unsupported, unavailable, denied, blocked, cancelled, temporary, and provider failures remain distinguishable.
- Listener registration returns an awaitable cleanup function.
- SSR imports never touch `window`, `navigator`, or a native bridge.
- Ordinary and secure storage are different capabilities.
- Provider-native values may be exposed only in an optional diagnostic field.
- Adapter capabilities are independent subpath entries and do not pull every native plugin into the base adapter.

## Core surface

The root facade remains import-only for applications and delegates to one installed
adapter. `platform.info()`, `network.status()`, normalized launch/inbound links,
lifecycle/resume/restored-operation listeners, and ordinary storage work without
provider branches. Back interception, clipboard, sharing, haptics, foreground
location, and secure
storage are optional adapter features. Their capability queries return a
discriminated unavailable result. Clipboard and sharing fail with a typed error
when unavailable; haptic effects safely degrade to a no-op so tactile feedback
never becomes required for an application action.

Capability status distinguishes native, web-standard, and emulated fidelity from
unsupported, runtime-unavailable, permission-required, and policy-blocked states.
Permission status is separate and normalized to `prompt`, `granted`, `denied`,
`blocked`, `limited`, or `unavailable`. A query cannot request permission.

The web adapter uses Page Visibility, online/offline events, browser storage,
history/hash events, reduced-motion media queries, and CSS safe-area environment
values. It accepts only audited external URL schemes. The SSR adapter is safe to
import without browser globals: queries report unavailable and device/UI effects
fail or return inert subscriptions according to their contract.

`@absolutejs/devices/testing` supplies an in-memory adapter, event emitters,
permission controller, and shared conformance harness. Provider packages use that
harness with their own mocked event source so runtime identity, event delivery,
cleanup, back behavior, and storage semantics cannot drift.

Secure storage is deliberately not implemented with browser local storage. The
seam exists for Auth and other credential owners, but a platform provider must opt
in with a real secure implementation.

## Capacitor baseline

The Capacitor adapter normalizes App lifecycle, resume, restored results, launch
and inbound URLs, Android hardware back, Network status, Browser opening, and
Preferences. Listener cleanup is idempotent and provider failures become typed
device errors. External browser URLs are limited to HTTP(S) and reject embedded
credentials.

Preferences keys are namespaced. `clear()` enumerates and removes only keys owned
by the adapter instead of calling Capacitor's global `Preferences.clear()`. The
baseline App, Browser, Network, and Preferences plugins are runtime infrastructure
used by navigation, auth, connectivity/Sync, and compatibility state; future
permission-sensitive APIs remain separate slices and must not install plugins or
request permissions merely because the base adapter is present.

Clipboard, Share, and Haptics are separate package exports. The base adapter
accepts their provider-neutral implementations through options and contains no
imports of those optional Capacitor plugins. The package publishes a validated,
versioned `absolutejs.devices` manifest that maps each capability to its factory,
subpath, and exact tested native package version. AbsoluteJS owns source discovery,
dependency installation, and generated bootstrap wiring. This keeps the manifest
declarative and prevents a dependency package from executing installation code.

Camera/photos and foreground location follow the same isolated-provider model.
Location exposes explicit approximate/precise permission, one-shot reads, and
watched position/error events with mandatory cleanup. It does not imply
background tracking: that would require a separate capability, native provider,
permission set, persistence policy, and store-review posture.

Automatic bootstrap installs the adapter only when Capacitor reports a native
platform. Browser previews retain the web adapter. Secure storage remains absent
unless a distinct Keychain/Keystore-backed implementation is injected.

## Emulator ownership

Emulators are host development infrastructure. The AbsoluteJS mobile CLI owns SDK discovery, provisioning, boot readiness, Capacitor build/deploy, HMR transport, logs, recovery, and cleanup. None of that code belongs in these runtime packages or an application binary.
