import { describe, expect, test } from "bun:test";
import { DeviceError, links, parseDeviceLink } from "../src";
import { installDeviceAdapter } from "../src/runtime";
import { createTestDeviceAdapter } from "../src/testing";

describe("device links", () => {
  test("normalizes custom schemes without losing query or fragment data", () => {
    const link = parseDeviceLink(
      "product://account/orders/42?source=push&empty=#receipt",
    );
    expect(link).toMatchObject({
      fragment: "receipt",
      host: "account",
      pathname: "/orders/42",
      scheme: "product",
    });
    expect(link.query.get("source")).toBe("push");
    expect(link.query.has("empty")).toBe(true);
  });

  test("resolves intentional relative links against an explicit base", () => {
    expect(
      parseDeviceLink("/settings?tab=security", "https://example.com/app").href,
    ).toBe("https://example.com/settings?tab=security");
  });

  test("rejects invalid URLs and embedded credentials", () => {
    expect(() => parseDeviceLink("relative-without-base")).toThrow(DeviceError);
    expect(() => parseDeviceLink("https://user:secret@example.com")).toThrow(
      "must not contain embedded credentials",
    );
  });

  test("exposes normalized launch and inbound links through the facade", async () => {
    const device = createTestDeviceAdapter({
      launchUrl: "product://account/start?source=launch#ready",
    });
    const removeAdapter = installDeviceAdapter(device.adapter);
    try {
      expect(await links.getLaunchLink()).toMatchObject({
        fragment: "ready",
        pathname: "/start",
        scheme: "product",
      });
      const opened: string[] = [];
      const removeListener = await links.onOpenLink((link) =>
        opened.push(link.href),
      );
      device.emitLink("https://example.com/orders/42?source=push");
      expect(opened).toEqual(["https://example.com/orders/42?source=push"]);
      await removeListener();
    } finally {
      removeAdapter();
    }
  });
});
