# @absolutejs/devices

Application-facing device capability contracts for AbsoluteJS. Runtime adapters
are selected by AbsoluteJS; application code does not branch on its native
provider.

The pre-1.0 core includes:

- discriminated capability availability and normalized device errors;
- shared permission states without implicit permission requests;
- platform, safe-area, reduced-motion, lifecycle, resume, restored-operation,
  normalized link, network, and back contracts;
- provider-neutral clipboard, system-share, and safely degrading haptic contracts;
- separate ordinary and secure-storage surfaces;
- SSR-safe, standards-based web, and deterministic test adapters;
- a reusable adapter conformance harness.

Explicit adapter entry points are available at `@absolutejs/devices/web`,
`@absolutejs/devices/ssr`, and `@absolutejs/devices/testing`. Normal application
code imports from `@absolutejs/devices`; AbsoluteJS installs the target adapter
during bootstrap.

Named imports are also the native provisioning declaration:

```ts
import { clipboard, haptics, share } from "@absolutejs/devices";

await clipboard.writeText("Copied");
await share.share({ text: "Hello from AbsoluteJS" });
await haptics.impact("light");
```

AbsoluteJS installs and wires the matching native provider slices during mobile
initialization. Browser and SSR behavior remains standards-based and safe without
application-side runtime branches.

The installation registry is shared through the JavaScript realm, so
independently built shell and page bundles still observe the same selected
adapter.

Ordinary storage is not appropriate for refresh tokens, private keys, or other
durable credentials. `secureStorage` fails with a typed `unsupported` error until
the selected provider installs a real secure-storage adapter. Its test
implementation is an in-memory emulator, never a claim of cryptographic storage.
