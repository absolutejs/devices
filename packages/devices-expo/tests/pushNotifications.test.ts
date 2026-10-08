import { beforeEach, describe, expect, test, mock } from "bun:test";

const DEFAULT_ACTION_IDENTIFIER = "expo.modules.notifications.actions.DEFAULT";

type Response = {
  actionIdentifier: string;
  notification: {
    request: { content: Record<string, unknown>; identifier: string };
  };
  userText?: string;
};

let launchResponse: Response | null = null;
let responseListener: ((value: Response) => void) | undefined;
let cleared = 0;

mock.module("expo-notifications", () => ({
  DEFAULT_ACTION_IDENTIFIER,
  addNotificationReceivedListener: () => ({ remove: () => undefined }),
  addNotificationResponseReceivedListener: (
    listener: (value: Response) => void,
  ) => {
    responseListener = listener;
    return { remove: () => (responseListener = undefined) };
  },
  clearLastNotificationResponse: () => {
    cleared += 1;
    launchResponse = null;
  },
  getLastNotificationResponse: () => launchResponse,
  IosAuthorizationStatus: { EPHEMERAL: 4, PROVISIONAL: 3 },
}));

const { createExpoPushNotificationsCapability } =
  await import("../src/pushNotifications");

const tap = (identifier: string): Response => ({
  actionIdentifier: DEFAULT_ACTION_IDENTIFIER,
  notification: {
    request: {
      content: { data: { absoluteDeepLink: "/orders/42" }, title: "Order" },
      identifier,
    },
  },
});

beforeEach(() => {
  launchResponse = null;
  responseListener = undefined;
  cleared = 0;
});

describe("Expo push actions", () => {
  test("delivers the tap that launched the app once, then clears it", async () => {
    launchResponse = tap("launch-1");
    const actions: string[] = [];
    const push = createExpoPushNotificationsCapability();
    await push.onAction((action) =>
      actions.push(`${action.actionId}:${action.notification.id}`),
    );

    expect(actions).toEqual(["tap:launch-1"]);
    expect(cleared).toBe(1);

    const later: string[] = [];
    await push.onAction((action) => later.push(action.notification.id));
    expect(later).toEqual([]);
  });

  test("does not deliver the launch tap twice when the listener reports it too", async () => {
    launchResponse = tap("launch-2");
    const actions: string[] = [];
    await createExpoPushNotificationsCapability().onAction((action) =>
      actions.push(action.notification.id),
    );
    responseListener?.(tap("launch-2"));
    responseListener?.(tap("running-3"));

    expect(actions).toEqual(["launch-2", "running-3"]);
  });
});
