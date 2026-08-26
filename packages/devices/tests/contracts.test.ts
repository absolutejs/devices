import { describe, expect, test } from "bun:test";
import {
  DeviceError,
  availableCapability,
  isDeviceError,
  normalizeDeviceError,
  normalizeDeviceLocalNotification,
  runtimeCapability,
  unavailableCapability,
} from "../src";
import { createTestPermission } from "../src/testing";

describe("device capability contracts", () => {
  test("distinguishes native, web, test, and SSR availability", () => {
    expect(runtimeCapability("capacitor")).toEqual({
      available: true,
      fidelity: "native",
    });
    expect(runtimeCapability("web")).toEqual({
      available: true,
      fidelity: "web",
    });
    expect(runtimeCapability("test")).toEqual({
      available: true,
      fidelity: "emulated",
    });
    expect(runtimeCapability("ssr")).toMatchObject({
      available: false,
      reason: "unavailable",
    });
    expect(availableCapability("native", { provider: "example" })).toEqual({
      available: true,
      fidelity: "native",
      native: { provider: "example" },
    });
    expect(unavailableCapability("policy-blocked")).toEqual({
      available: false,
      reason: "policy-blocked",
    });
  });

  test("normalizes provider failures without erasing device errors", () => {
    const original = new DeviceError("cancelled", "User cancelled.");
    expect(normalizeDeviceError(original, { message: "Failed." })).toBe(
      original,
    );
    const normalized = normalizeDeviceError(new Error("provider"), {
      message: "Camera failed.",
    });
    expect(isDeviceError(normalized)).toBe(true);
    expect(normalized).toMatchObject({
      code: "failed",
      message: "Camera failed.",
    });
  });

  test("permission queries never trigger permission requests", async () => {
    const permission = createTestPermission();
    expect(await permission.permission.queryPermission()).toEqual({
      canRequest: true,
      state: "prompt",
    });
    expect(permission.requests).toBe(0);
    expect(await permission.permission.requestPermission()).toEqual({
      canRequest: false,
      state: "granted",
    });
    expect(permission.requests).toBe(1);
  });

  test("validates portable local notification payloads", () => {
    expect(
      normalizeDeviceLocalNotification({
        body: "Your report is ready.",
        data: { route: "/reports/42" },
        id: 42,
        scheduledAtMs: 1_777_000_000_000,
        title: "AbsoluteJS",
      }),
    ).toEqual({
      body: "Your report is ready.",
      data: { route: "/reports/42" },
      id: 42,
      scheduledAtMs: 1_777_000_000_000,
      title: "AbsoluteJS",
    });
    expect(() =>
      normalizeDeviceLocalNotification({ body: "Body", id: 0, title: "Title" }),
    ).toThrow(TypeError);
    expect(() =>
      normalizeDeviceLocalNotification({
        body: "Body",
        data: { invalid: 1 as unknown as string },
        id: 1,
        title: "Title",
      }),
    ).toThrow(TypeError);
  });
});
