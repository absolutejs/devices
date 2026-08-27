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
- opt-in Clipboard, Share, Haptics, Camera, and scoped photo-picker provider
  slices; and
- opt-in foreground Geolocation with approximate/precise permission reporting,
  one-shot reads, watched updates, and deterministic cleanup.
- opt-in Documents selection, native share/save export, and native preview with
  bounded cache staging and deterministic cleanup.
- opt-in Local Notifications with explicit permission, best-effort one-time
  scheduling, cancellation, pending inspection, and receipt/tap events.
- opt-in Push Notifications through Capacitor 8.1.2, with provider tokens
  confined to the generated authenticated registration bridge.
- opt-in Keyboard 8.0.5 visibility/height events and dismissal, plus the
  Capacitor 8 core SystemBars API for modern edge-to-edge status/navigation UI.

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
import {
  createCapacitorCameraCapability,
  createCapacitorPhotosCapability,
} from "@absolutejs/devices-capacitor/camera";
import { createCapacitorHapticsCapability } from "@absolutejs/devices-capacitor/haptics";
import { createCapacitorKeyboardCapability } from "@absolutejs/devices-capacitor/keyboard";
import { createCapacitorLocationCapability } from "@absolutejs/devices-capacitor/location";
import { createCapacitorLocalNotificationsCapability } from "@absolutejs/devices-capacitor/local-notifications";
import { createCapacitorPushNotificationsCapability } from "@absolutejs/devices-capacitor/push-notifications";
import { createCapacitorDocumentsCapability } from "@absolutejs/devices-capacitor/documents";
import { createCapacitorShareCapability } from "@absolutejs/devices-capacitor/share";
import { createCapacitorSystemBarsCapability } from "@absolutejs/devices-capacitor/system-bars";
```

The `absolutejs.devices` field in this package's `package.json` declares the
factory, exact tested Capacitor dependency, and native permission purposes for
each slice. The AbsoluteJS CLI consumes that metadata, generates imports and iOS
usage descriptions, and leaves Android free of unnecessary camera/storage
permissions. Foreground location adds only coarse/fine Android permissions and
the provider-required iOS usage strings. Users keep importing the
provider-neutral facade only. The base
entry does not import these plugins.

System bars use Capacitor 8's core edge-to-edge API rather than the legacy
Status Bar plugin. Public `light`/`dark` values name foreground icon/text color,
avoiding the provider enum's background-oriented wording. Browser appearance is
best-effort through `color-scheme`; browser chrome visibility fails explicitly.

Documents use the WebView's system-backed file input for scoped selection, so
selected content remains Blob-backed and path-free. Export and preview stage a
bounded file only in Capacitor's cache directory, call the official Share or
File Viewer plugin, and then erase the staged file. AbsoluteJS generates and
targets the Filesystem plugin's required Apple privacy manifest entry
(`NSPrivacyAccessedAPICategoryFileTimestamp`, reason `C617.1`) from package
metadata; users do not edit Xcode or `PrivacyInfo.xcprivacy`.

Camera permission is never prompted implicitly: portable application code calls
`camera.requestPermission()` from an intentional user action before
`camera.takePhoto()`. `photos.pick()` opens the selected-item system picker and
does not request broad photo-library access. Captures are not saved to the
gallery and EXIF metadata is not returned by this first slice.

Location permission is also explicit. The adapter does not start a watch during
bootstrap, never claims background delivery, preserves approximate versus precise
access, and maps disabled services, policy restriction, timeout, and provider
failures into the shared device error vocabulary. Every successful watch returns
an idempotent cleanup function that clears the native provider watch.

Local Notifications uses the complete official Capacitor 8.2.1 release. The
adapter checks permission before every schedule and never lets the provider
prompt implicitly. AbsoluteJS installs the plugin only when application code
imports `localNotifications`; Android's display permission is projected from
provider metadata. This first contract intentionally uses inexact best-effort
schedules, so it does not request exact-alarm permissions or imply critical
delivery. Notification content and data must never contain secrets.

Push Notifications uses the official Capacitor 8.1.2 plugin. AbsoluteJS
projects the Android 13 display permission, validates and copies the Firebase
`google-services.json` for the configured application ID, adds the iOS APNs
entitlement, and installs Capacitor's AppDelegate registration forwarding. Raw
APNs/FCM tokens are accepted only by the adapter's internal registration sink;
`@absolutejs/devices` application code cannot read them. The server returns an
opaque installation identity that the shell retains in Keychain/Keystore for
rotation and authenticated removal.

The JavaScript contract and native sources are tested in CI; release acceptance
still requires the real iOS/Android simulator checklist because native Keychain
and Keystore behavior cannot be proven by a browser test runner.
