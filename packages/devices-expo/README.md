# @absolutejs/devices-expo

Expo SDK 57 provider for the framework-neutral `@absolutejs/devices` contracts.
AbsoluteJS provisions this package and only the detected optional Expo modules.
Application code continues to import capabilities from `@absolutejs/devices`.

The root entry installs platform, lifecycle, links, Android Back, network, and
namespaced ordinary storage. Optional capabilities are exposed through isolated
subpaths so unused permissions and native modules are not added to an app.
