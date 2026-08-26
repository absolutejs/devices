# @absolutejs/devices

Application-facing device capability contracts for AbsoluteJS. Runtime adapters
are selected by AbsoluteJS; application code does not branch on its native
provider.

The pre-1.0 core includes:

- discriminated capability availability and normalized device errors;
- shared permission states without implicit permission requests;
- platform, safe-area, reduced-motion, lifecycle, resume, restored-operation,
  normalized link, network, and back contracts;
- provider-neutral clipboard, system-share, safely degrading haptic, explicit
  camera-permission, item-scoped photo-picker, and foreground location
  contracts;
- bounded document selection, export, and preview without exposing native
  filesystem paths;
- explicit-permission local notification scheduling, cancellation, pending
  inspection, receipt events, and tap/action events;
- separate ordinary and secure-storage surfaces;
- SSR-safe, standards-based web, and deterministic test adapters;
- a reusable adapter conformance harness.

Explicit adapter entry points are available at `@absolutejs/devices/web`,
`@absolutejs/devices/ssr`, and `@absolutejs/devices/testing`. Normal application
code imports from `@absolutejs/devices`; AbsoluteJS installs the target adapter
during bootstrap.

Named imports are also the native provisioning declaration:

```ts
import {
  camera,
  clipboard,
  documents,
  haptics,
  location,
  localNotifications,
  photos,
  share,
} from "@absolutejs/devices";

await clipboard.writeText("Copied");
await share.share({ text: "Hello from AbsoluteJS" });
await haptics.impact("light");
const [document] = await documents.pick({
  accept: ["application/pdf", ".csv"],
  limit: 1,
});
if (document) await upload(document.blob);
await documents.export({ content: "Portable report", name: "report.txt" });
const permission = await camera.requestPermission();
if (permission.state === "granted") {
  const capture = await camera.takePhoto({ direction: "rear" });
  image.src = capture.webPath;
}
const [chosen] = await photos.pick({ limit: 1 });

const notificationPermission = await localNotifications.requestPermission();
if (notificationPermission.state === "granted") {
  await localNotifications.schedule({
    body: "Your report is ready.",
    data: { route: "/reports/42" },
    id: 42,
    title: "AbsoluteJS",
  });
}

const locationPermission = await location.requestPermission({
  precision: "coarse",
});
if (locationPermission.state === "granted") {
  const current = await location.current();
  const stop = await location.watch((event) => {
    if (event.type === "position") console.log(event.position);
  });
  // Stop promptly when the owning view no longer needs location updates.
  await stop();
}
```

AbsoluteJS installs and wires the matching native provider slices during mobile
initialization. Browser and SSR behavior remains standards-based and safe without
application-side runtime branches.

Documents default to a 64 MiB per-file ceiling, which can be lowered or raised
explicitly with `maximumBytes`. Names must be leaf filenames: path separators,
control characters, `.` and `..` are rejected. Picked files are returned as
Blob-backed metadata and never include a native path. Browser export uses a
download and browser preview uses a temporary object URL.

Location is foreground-only. Capability and permission queries never prompt;
`requestPermission()` must run from an intentional user action. The normalized
status reports `coarse`, `precise`, or `unknown` precision, and watch callbacks
deliver typed position/error events. Background tracking is deliberately not
included because it requires a separate privacy, battery, store-review, and
native-lifecycle contract.

Local notification IDs are stable positive 32-bit integers. Scheduling is
best-effort and deliberately excludes repeating, exact-alarm, critical-alert,
and custom-action registration from this first portable contract. Browser
scheduling is an emulated, page-lifetime fallback and reports that it is not
durable across reloads. Notification titles, bodies, and data may be visible on
a locked device and must not contain credentials or other secrets.

The installation registry is shared through the JavaScript realm, so
independently built shell and page bundles still observe the same selected
adapter.

Ordinary storage is not appropriate for refresh tokens, private keys, or other
durable credentials. `secureStorage` fails with a typed `unsupported` error until
the selected provider installs a real secure-storage adapter. Its test
implementation is an in-memory emulator, never a claim of cryptographic storage.
