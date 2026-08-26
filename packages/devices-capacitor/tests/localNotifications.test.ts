import { describe, expect, mock, test } from "bun:test";
import type {
  ActionPerformed,
  LocalNotificationSchema,
  LocalNotificationsPlugin,
  PermissionStatus,
} from "@capacitor/local-notifications";
import { createCapacitorLocalNotificationsCapability } from "../src/localNotifications";

const runtime = (installed = true) => ({
  getPlatform: () => "android",
  isNativePlatform: () => true,
  isPluginAvailable: (name: string) =>
    installed && name === "LocalNotifications",
});

const harness = () => {
  let permission: PermissionStatus = { display: "prompt" };
  let pending: LocalNotificationSchema[] = [];
  let received: ((notification: LocalNotificationSchema) => void) | undefined;
  let performed: ((action: ActionPerformed) => void) | undefined;
  const schedule = mock(async ({ notifications }) => {
    pending = [...notifications];
    return { notifications: notifications.map(({ id }) => ({ id })) };
  });
  const requestPermissions = mock(async () => {
    permission = { display: "granted" };
    return permission;
  });
  const plugin = {
    addListener: async (
      event: string,
      listener: (...args: never[]) => void,
    ) => {
      if (event === "localNotificationReceived")
        received = listener as (notification: LocalNotificationSchema) => void;
      if (event === "localNotificationActionPerformed")
        performed = listener as (action: ActionPerformed) => void;
      return { remove: mock(async () => undefined) };
    },
    cancel: async ({ notifications }) => {
      const ids = new Set(notifications.map(({ id }) => id));
      pending = pending.filter(({ id }) => !ids.has(id));
    },
    checkPermissions: async () => permission,
    getPending: async () => ({ notifications: pending }),
    requestPermissions,
    schedule,
  } as unknown as LocalNotificationsPlugin;
  return {
    bindings: { capacitor: runtime(), localNotifications: plugin },
    emitAction: (action: ActionPerformed) => performed?.(action),
    emitReceived: (notification: LocalNotificationSchema) =>
      received?.(notification),
    requestPermissions,
    schedule,
  };
};

describe("Capacitor local notifications capability", () => {
  test("keeps permission explicit and normalizes schedule, pending, and events", async () => {
    const test = harness();
    const notifications = createCapacitorLocalNotificationsCapability(
      test.bindings,
    );

    await expect(
      notifications.schedule({ body: "Ready", id: 42, title: "Report" }),
    ).rejects.toMatchObject({ code: "permission-required" });
    expect(test.schedule).not.toHaveBeenCalled();
    expect(await notifications.requestPermission()).toMatchObject({
      state: "granted",
    });
    const scheduledAtMs = Date.now() + 60_000;
    await notifications.schedule({
      body: "Ready",
      data: { route: "/reports/42" },
      id: 42,
      scheduledAtMs,
      title: "Report",
    });
    expect(test.schedule).toHaveBeenCalledWith({
      notifications: [
        expect.objectContaining({
          body: "Ready",
          extra: {
            __absolutejsLocalNotificationData: { route: "/reports/42" },
          },
          id: 42,
          title: "Report",
        }),
      ],
    });
    expect(await notifications.pending()).toEqual([
      expect.objectContaining({
        data: { route: "/reports/42" },
        id: 42,
        scheduledAtMs,
      }),
    ]);

    const events: string[] = [];
    const removeReceived = await notifications.onReceived((notification) =>
      events.push(`received:${notification.id}`),
    );
    const removeAction = await notifications.onAction((action) =>
      events.push(`${action.actionId}:${action.notification.id}`),
    );
    const providerNotification = (await test.schedule.mock.results[0]!.value)
      .notifications[0];
    const fullNotification = {
      body: "Ready",
      extra: {
        __absolutejsLocalNotificationData: { route: "/reports/42" },
      },
      id: providerNotification!.id,
      schedule: { at: new Date(scheduledAtMs) },
      title: "Report",
    };
    test.emitReceived(fullNotification);
    test.emitAction({ actionId: "tap", notification: fullNotification });
    expect(events).toEqual(["received:42", "tap:42"]);
    await removeReceived();
    await removeReceived();
    await removeAction();

    await notifications.cancel([42]);
    expect(await notifications.pending()).toEqual([]);
  });

  test("fails closed when the optional plugin is absent", async () => {
    const notifications = createCapacitorLocalNotificationsCapability({
      capacitor: runtime(false),
      localNotifications: {} as LocalNotificationsPlugin,
    });
    expect(await notifications.capability()).toMatchObject({
      available: false,
      reason: "unsupported",
    });
    await expect(notifications.requestPermission()).rejects.toMatchObject({
      code: "unsupported",
    });
  });
});
