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

## Emulator ownership

Emulators are host development infrastructure. The AbsoluteJS mobile CLI owns SDK discovery, provisioning, boot readiness, Capacitor build/deploy, HMR transport, logs, recovery, and cleanup. None of that code belongs in these runtime packages or an application binary.
