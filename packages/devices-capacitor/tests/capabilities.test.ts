import { describe, expect, mock, test } from "bun:test";
import { createCapacitorClipboardCapability } from "../src/clipboard";
import { createCapacitorHapticsCapability } from "../src/haptics";
import { createCapacitorShareCapability } from "../src/share";

const runtime = (plugins: string[]) => ({
  getPlatform: () => "ios",
  isNativePlatform: () => true,
  isPluginAvailable: (name: string) => plugins.includes(name),
});

describe("optional Capacitor capabilities", () => {
  test("normalizes clipboard text and fails closed without its plugin", async () => {
    let value = "initial";
    const clipboard = createCapacitorClipboardCapability({
      capacitor: runtime(["Clipboard"]),
      clipboard: {
        read: async () => ({ type: "text/plain", value }),
        write: async (options) => {
          value = options.string ?? "";
        },
      },
    });
    await clipboard.writeText("updated");
    expect(await clipboard.readText()).toBe("updated");
    expect(await clipboard.capability("read")).toMatchObject({
      available: true,
      fidelity: "native",
    });
    const missing = createCapacitorClipboardCapability({
      capacitor: runtime([]),
      clipboard: {
        read: async () => ({ type: "text/plain", value: "never" }),
        write: async () => undefined,
      },
    });
    await expect(missing.readText()).rejects.toMatchObject({
      code: "unsupported",
    });
  });

  test("validates share content and preserves only public provider results", async () => {
    const providerShare = mock(async () => ({ activityType: "messages" }));
    const share = createCapacitorShareCapability({
      capacitor: runtime(["Share"]),
      share: {
        canShare: async () => ({ value: true }),
        share: providerShare,
      },
    });
    expect(
      await share.share({ text: "Hello", url: "https://absolutejs.com" }),
    ).toMatchObject({ activity: "messages" });
    expect(providerShare).toHaveBeenCalledWith({
      text: "Hello",
      url: "https://absolutejs.com/",
    });
    await expect(
      share.share({ url: "file:///private/secret" }),
    ).rejects.toBeInstanceOf(TypeError);
  });

  test("maps haptic vocabulary and safely no-ops without hardware support", async () => {
    const impact = mock(async () => undefined);
    const notification = mock(async () => undefined);
    const haptics = createCapacitorHapticsCapability({
      capacitor: runtime(["Haptics"]),
      haptics: {
        impact,
        notification,
        selectionChanged: async () => undefined,
        selectionEnd: async () => undefined,
        selectionStart: async () => undefined,
        vibrate: async () => undefined,
      },
    });
    await haptics.impact("light");
    await haptics.notification("warning");
    expect(impact).toHaveBeenCalledWith({ style: "LIGHT" });
    expect(notification).toHaveBeenCalledWith({ type: "WARNING" });

    const unavailable = createCapacitorHapticsCapability({
      capacitor: runtime([]),
      haptics: {
        impact,
        notification,
        selectionChanged: async () => undefined,
        selectionEnd: async () => undefined,
        selectionStart: async () => undefined,
        vibrate: async () => undefined,
      },
    });
    await unavailable.impact();
    expect(await unavailable.capability()).toMatchObject({ available: false });
  });
});
