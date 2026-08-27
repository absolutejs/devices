import { describe, expect, mock, test } from "bun:test";
import type { KeyboardInfo, KeyboardPlugin } from "@capacitor/keyboard";
import { SystemBarType, SystemBarsStyle, SystemBars } from "@capacitor/core";
import { createCapacitorKeyboardCapability } from "../src/keyboard";
import { createCapacitorSystemBarsCapability } from "../src/systemBars";

const runtime = (plugins: string[]) => ({
  getPlatform: () => "android",
  isNativePlatform: () => true,
  isPluginAvailable: (name: string) => plugins.includes(name),
});

describe("Capacitor system UI capabilities", () => {
  test("normalizes keyboard visibility, height, dismissal, and cleanup", async () => {
    let show: ((info: KeyboardInfo) => void) | undefined;
    let hide: (() => void) | undefined;
    const removals = [mock(async () => undefined), mock(async () => undefined)];
    const dismiss = mock(async () => undefined);
    let listener = 0;
    const plugin = {
      addListener: async (
        event: string,
        callback: (...args: never[]) => void,
      ) => {
        if (event === "keyboardDidShow")
          show = callback as (info: KeyboardInfo) => void;
        else hide = callback as () => void;
        return { remove: removals[listener++]! };
      },
      hide: dismiss,
    } as unknown as KeyboardPlugin;
    const keyboard = createCapacitorKeyboardCapability({
      capacitor: runtime(["Keyboard"]),
      keyboard: plugin,
    });
    const states: string[] = [];
    const remove = await keyboard.onChange((state) =>
      states.push(`${state.visible}:${state.heightPx}`),
    );

    show?.({ keyboardHeight: 311.6 });
    hide?.();
    expect(states).toEqual(["true:312", "false:0"]);
    await keyboard.dismiss();
    expect(dismiss).toHaveBeenCalledTimes(1);
    await remove();
    await remove();
    expect(removals[0]).toHaveBeenCalledTimes(1);
    expect(removals[1]).toHaveBeenCalledTimes(1);
  });

  test("maps explicit foreground appearance and targeted visibility", async () => {
    const setStyle = mock(async () => undefined);
    const show = mock(async () => undefined);
    const hide = mock(async () => undefined);
    const bars = createCapacitorSystemBarsCapability({
      capacitor: runtime(["SystemBars"]),
      systemBars: {
        ...SystemBars,
        hide,
        setStyle,
        show,
      },
    });

    await bars.setAppearance("light", "status");
    await bars.setAppearance("dark", "navigation");
    await bars.setVisible(false, "navigation");
    await bars.setVisible(true);
    expect(setStyle).toHaveBeenNthCalledWith(1, {
      bar: SystemBarType.StatusBar,
      style: SystemBarsStyle.Dark,
    });
    expect(setStyle).toHaveBeenNthCalledWith(2, {
      bar: SystemBarType.NavigationBar,
      style: SystemBarsStyle.Light,
    });
    expect(hide).toHaveBeenCalledWith({ bar: SystemBarType.NavigationBar });
    expect(show).toHaveBeenCalledWith({});
  });

  test("fails closed when native providers are absent", async () => {
    const keyboard = createCapacitorKeyboardCapability({
      capacitor: runtime([]),
      keyboard: {} as KeyboardPlugin,
    });
    const bars = createCapacitorSystemBarsCapability({
      capacitor: runtime([]),
      systemBars: SystemBars,
    });
    await expect(keyboard.dismiss()).rejects.toMatchObject({
      code: "unsupported",
    });
    await expect(bars.setVisible(false)).rejects.toMatchObject({
      code: "unsupported",
    });
  });
});
