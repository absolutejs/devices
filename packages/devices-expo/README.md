# @absolutejs/devices-expo

Expo SDK 57 provider for the framework-neutral `@absolutejs/devices` contracts.
AbsoluteJS provisions this package and only the detected optional Expo modules.
Application code continues to import capabilities from `@absolutejs/devices`.

The root entry installs platform, lifecycle, links, Android Back, network, and
namespaced ordinary storage. Optional capabilities are exposed through isolated
subpaths so unused permissions and native modules are not added to an app.

On Android, the photo provider consumes Expo Image Picker's pending result when
the system recreates the host activity. The normalized result is replayed once
per subscriber through `lifecycle.onRestoredOperation`; embedded routes receive
photo bytes through the same bounded transfer bridge as an ordinary pick. Native
paths and Expo result objects are not exposed across that bridge. This recovery
uses a short, bounded retry window so a result published just after activity
recreation is still recovered without application-owned Android code or
continuous polling. A restored operation uses
`plugin: "expo-image-picker"`, `method: "pick"`, and carries either normalized
`DevicePhoto[]` data or a public error.

If Android destroys the JavaScript process and the user then cancels the
external picker, Expo has no successful result to retain. The adapter waits for
the same bounded recovery window, turns an inherited in-flight descriptor into
one public `cancelled` operation, and deletes the descriptor. A picker still
owned by the current JavaScript process is never abandoned by that recovery
window.
