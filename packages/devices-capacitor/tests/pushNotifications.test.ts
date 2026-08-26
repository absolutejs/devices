import { describe, expect, mock, test } from "bun:test";
import type {
  ActionPerformed,
  PermissionStatus,
  PushNotificationSchema,
  PushNotificationsPlugin,
  RegistrationError,
  Token,
} from "@capacitor/push-notifications";
import { createCapacitorPushNotificationsCapability } from "../src/pushNotifications";

const runtime = (platform = "android", installed = true) => ({
  getPlatform: () => platform,
  isNativePlatform: () => true,
  isPluginAvailable: (name: string) =>
    installed && name === "PushNotifications",
});

const harness = (platform = "android") => {
  let permission: PermissionStatus = { receive: "prompt" };
  let registered: ((token: Token) => void) | undefined;
  let registrationError: ((error: RegistrationError) => void) | undefined;
  let received: ((notification: PushNotificationSchema) => void) | undefined;
  let performed: ((action: ActionPerformed) => void) | undefined;
  const unregister = mock(async () => undefined);
  const plugin = {
    addListener: async (
      event: string,
      listener: (...args: never[]) => void,
    ) => {
      if (event === "registration")
        registered = listener as (token: Token) => void;
      if (event === "registrationError")
        registrationError = listener as (error: RegistrationError) => void;
      if (event === "pushNotificationReceived")
        received = listener as (value: PushNotificationSchema) => void;
      if (event === "pushNotificationActionPerformed")
        performed = listener as (value: ActionPerformed) => void;
      return { remove: mock(async () => undefined) };
    },
    checkPermissions: async () => permission,
    register: async () => {
      queueMicrotask(() => registered?.({ value: "provider-token" }));
    },
    requestPermissions: async () => {
      permission = { receive: "granted" };
      return permission;
    },
    unregister,
  } as unknown as PushNotificationsPlugin;

  return {
    bindings: { capacitor: runtime(platform), pushNotifications: plugin },
    emitAction: (value: ActionPerformed) => performed?.(value),
    emitError: (error: string) => registrationError?.({ error }),
    emitReceived: (value: PushNotificationSchema) => received?.(value),
    unregister,
  };
};

describe("Capacitor push notifications capability", () => {
  test("keeps raw registration credentials behind the adapter boundary", async () => {
    const test = harness("ios");
    const registrations: unknown[] = [];
    const push = createCapacitorPushNotificationsCapability({
      bindings: test.bindings,
      onRegistration: async (registration) => registrations.push(registration),
    });

    expect(await push.requestPermission()).toMatchObject({ state: "granted" });
    expect(await push.enable()).toBeUndefined();
    expect(registrations).toEqual([
      { platform: "apns", token: "provider-token" },
    ]);
  });

  test("normalizes receipt and action events without trusting provider data", async () => {
    const test = harness();
    const push = createCapacitorPushNotificationsCapability({
      bindings: test.bindings,
    });
    const events: unknown[] = [];
    await push.onReceived((value) => events.push(value));
    await push.onAction((value) => events.push(value));
    const provider = {
      body: "Ready",
      data: {
        count: 2,
        route: "/reports/42",
        unsafe: () => "discarded",
      },
      id: "push-42",
      title: "Report",
    };
    test.emitReceived(provider);
    test.emitAction({ actionId: "open", notification: provider });

    expect(events).toEqual([
      expect.objectContaining({
        data: { count: 2, route: "/reports/42" },
        id: "push-42",
      }),
      expect.objectContaining({
        actionId: "open",
        notification: expect.objectContaining({ id: "push-42" }),
      }),
    ]);
  });

  test("removes the backend installation before native unregistration", async () => {
    const test = harness();
    const order: string[] = [];
    test.unregister.mockImplementation(async () => {
      order.push("native");
    });
    const push = createCapacitorPushNotificationsCapability({
      bindings: test.bindings,
      onUnregistration: async () => {
        order.push("backend");
      },
    });
    await push.disable();
    expect(order).toEqual(["backend", "native"]);
  });

  test("rolls back native registration when the backend rejects it", async () => {
    const test = harness();
    const push = createCapacitorPushNotificationsCapability({
      bindings: test.bindings,
      onRegistration: async () => {
        throw new Error("unauthenticated");
      },
    });

    await expect(push.enable()).rejects.toMatchObject({ code: "failed" });
    expect(test.unregister).toHaveBeenCalledTimes(1);
  });

  test("fails closed when the optional plugin is absent", async () => {
    const push = createCapacitorPushNotificationsCapability({
      bindings: {
        capacitor: runtime("android", false),
        pushNotifications: {} as PushNotificationsPlugin,
      },
    });
    expect(await push.capability()).toMatchObject({
      available: false,
      reason: "unsupported",
    });
    await expect(push.enable()).rejects.toMatchObject({ code: "unsupported" });
  });
});
