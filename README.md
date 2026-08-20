# AbsoluteJS Devices

Provider-neutral device capabilities for AbsoluteJS applications.

The repository publishes two deliberately separate packages:

- `@absolutejs/devices` — dependency-light contracts plus web, SSR, and test adapters.
- `@absolutejs/devices-capacitor` — Capacitor implementations selected by an AbsoluteJS mobile build.

Application code imports capabilities from `@absolutejs/devices`; it does not branch on Capacitor or call vendor plugins directly. AbsoluteJS selects the runtime adapter for web, SSR, tests, and installed apps.

This repository does not own emulator orchestration. Target provisioning, native builds, HMR transport, and app launch are host-side responsibilities of the AbsoluteJS mobile CLI and must never enter an application bundle.

The first implementation wave covers platform information, lifecycle, links, network state, and ordinary key/value storage. Camera, location, files, notifications, secure credentials, and other permission-sensitive capabilities will land as isolated, tree-shakeable slices with conformance tests.

## Development

```bash
bun install
bun run check
```

The project is pre-1.0. Public contracts may change while the mobile runtime is being proven.

## License

Business Source License 1.1. Normal use in applications is permitted; see [LICENSE](LICENSE) for the complete terms. The code converts to Apache License 2.0 on the stated Change Date.
