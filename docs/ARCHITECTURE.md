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

## Contract rules

- Querying support never requests permission or opens UI.
- Unsupported, unavailable, denied, blocked, cancelled, temporary, and provider failures remain distinguishable.
- Listener registration returns an awaitable cleanup function.
- SSR imports never touch `window`, `navigator`, or a native bridge.
- Ordinary and secure storage are different capabilities.
- Provider-native values may be exposed only in an optional diagnostic field.
- Adapter packages are independently tree-shakeable and do not install every native plugin.

## Core surface

The root facade remains import-only for applications and delegates to one installed
adapter. `platform.info()`, `network.status()`, normalized launch/inbound links,
lifecycle/resume/restored-operation listeners, and ordinary storage work without
provider branches. Back interception and secure storage are optional adapter
features: their capability queries return a discriminated unavailable result and
their unsafe effects fail with a typed error when no provider is installed.

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

## Emulator ownership

Emulators are host development infrastructure. The AbsoluteJS mobile CLI owns SDK discovery, provisioning, boot readiness, Capacitor build/deploy, HMR transport, logs, recovery, and cleanup. None of that code belongs in these runtime packages or an application binary.
