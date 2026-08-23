import type {
  DeviceAdapter,
  DeviceBackEvent,
  DeviceLifecycleState,
  DeviceNetworkStatus,
  DeviceRestoredOperation,
} from "./contracts";

type MaybePromise = void | Promise<void>;

export type DeviceAdapterConformanceHarness = {
  adapter: DeviceAdapter;
  emitBack?: (event: DeviceBackEvent) => MaybePromise;
  emitLifecycle: (state: DeviceLifecycleState) => MaybePromise;
  emitLink: (url: string) => MaybePromise;
  emitNetwork: (status: DeviceNetworkStatus) => MaybePromise;
  emitRestoredOperation?: (operation: DeviceRestoredOperation) => MaybePromise;
  storage?: boolean;
};

const settle = async (emission: MaybePromise) => {
  await emission;
  await Promise.resolve();
};

export const inspectDeviceAdapterConformance = async (
  harness: DeviceAdapterConformanceHarness,
) => {
  const issues: string[] = [];
  const { adapter } = harness;
  const info = await adapter.platform.getInfo();
  if (info.runtime !== adapter.runtime)
    issues.push("platform runtime must match adapter runtime");

  const lifecycleEvents: DeviceLifecycleState[] = [];
  const removeLifecycle = await adapter.lifecycle.onChange((state) =>
    lifecycleEvents.push(state),
  );
  await settle(harness.emitLifecycle("background"));
  if (lifecycleEvents.at(-1) !== "background")
    issues.push("lifecycle listener did not receive the emitted state");
  await removeLifecycle();
  const lifecycleCount = lifecycleEvents.length;
  await settle(harness.emitLifecycle("active"));
  if (lifecycleEvents.length !== lifecycleCount)
    issues.push("lifecycle cleanup did not unsubscribe the listener");

  if (adapter.lifecycle.onResume) {
    let resumes = 0;
    const removeResume = await adapter.lifecycle.onResume(() => {
      resumes += 1;
    });
    await settle(harness.emitLifecycle("background"));
    await settle(harness.emitLifecycle("active"));
    if (resumes !== 1)
      issues.push("resume listener did not receive one active transition");
    await removeResume();
    await settle(harness.emitLifecycle("background"));
    await settle(harness.emitLifecycle("active"));
    if (resumes !== 1)
      issues.push("resume cleanup did not unsubscribe the listener");
  }

  if (adapter.lifecycle.onRestoredOperation && harness.emitRestoredOperation) {
    const restored: DeviceRestoredOperation[] = [];
    const removeRestored = await adapter.lifecycle.onRestoredOperation(
      (operation) => restored.push(operation),
    );
    const operation = {
      method: "conformance",
      plugin: "AbsoluteTest",
      success: true,
    } as const;
    await settle(harness.emitRestoredOperation(operation));
    if (restored.at(-1)?.method !== "conformance")
      issues.push("restored-operation listener did not receive the event");
    await removeRestored();
    const restoredCount = restored.length;
    await settle(harness.emitRestoredOperation(operation));
    if (restored.length !== restoredCount)
      issues.push(
        "restored-operation cleanup did not unsubscribe the listener",
      );
  }

  const networkEvents: DeviceNetworkStatus[] = [];
  const removeNetwork = await adapter.network.onChange((status) =>
    networkEvents.push(status),
  );
  const offline = { connected: false, connectionType: "none" } as const;
  await settle(harness.emitNetwork(offline));
  if (networkEvents.at(-1)?.connected !== false)
    issues.push("network listener did not receive the emitted status");
  await removeNetwork();
  const networkCount = networkEvents.length;
  await settle(
    harness.emitNetwork({ connected: true, connectionType: "wifi" }),
  );
  if (networkEvents.length !== networkCount)
    issues.push("network cleanup did not unsubscribe the listener");

  const linkEvents: string[] = [];
  const removeLink = await adapter.links.onOpen((url) => linkEvents.push(url));
  const testUrl = "absolute-test://device/path?value=1#fragment";
  await settle(harness.emitLink(testUrl));
  if (linkEvents.at(-1) !== testUrl)
    issues.push("link listener did not receive the emitted URL");
  await removeLink();
  const linkCount = linkEvents.length;
  await settle(harness.emitLink("absolute-test://device/ignored"));
  if (linkEvents.length !== linkCount)
    issues.push("link cleanup did not unsubscribe the listener");

  if (adapter.back && harness.emitBack) {
    const backEvents: DeviceBackEvent[] = [];
    const removeBack = await adapter.back.onPress((event) =>
      backEvents.push(event),
    );
    await settle(harness.emitBack({ canGoBack: true }));
    if (backEvents.at(-1)?.canGoBack !== true)
      issues.push("back listener did not receive the emitted event");
    await removeBack();
    const backCount = backEvents.length;
    await settle(harness.emitBack({ canGoBack: false }));
    if (backEvents.length !== backCount)
      issues.push("back cleanup did not unsubscribe the listener");
  }

  if (harness.storage) {
    const key = "__absolute_devices_conformance__";
    await adapter.storage.set(key, "value");
    if ((await adapter.storage.get(key)) !== "value")
      issues.push("storage did not round-trip a value");
    if (!(await adapter.storage.keys()).includes(key))
      issues.push("storage keys did not include the written key");
    await adapter.storage.remove(key);
    if ((await adapter.storage.get(key)) !== null)
      issues.push("storage remove did not delete the value");
  }

  return issues;
};

export const assertDeviceAdapterConformance = async (
  harness: DeviceAdapterConformanceHarness,
) => {
  const issues = await inspectDeviceAdapterConformance(harness);
  if (issues.length > 0)
    throw new Error(`Device adapter conformance failed: ${issues.join("; ")}`);
};
