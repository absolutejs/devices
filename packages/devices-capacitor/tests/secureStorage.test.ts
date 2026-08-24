import { describe, expect, test } from "bun:test";
import {
  createCapacitorSecureStorage,
  type AbsoluteSecureStoragePlugin,
} from "../src/secureStorage";

const createPlugin = (
  status: Awaited<ReturnType<AbsoluteSecureStoragePlugin["status"]>> = {
    backend: "keystore",
    hardwareBacked: true,
    persistent: true,
    secure: true,
  },
) => {
  const values = new Map<string, string>([["unrelated", "keep"]]);
  const plugin: AbsoluteSecureStoragePlugin = {
    clear: async ({ prefix }) => {
      for (const key of values.keys())
        if (key.startsWith(prefix)) values.delete(key);
    },
    get: async ({ key }) => ({ value: values.get(key) ?? null }),
    keys: async ({ prefix }) => ({
      keys: [...values.keys()].filter((key) => key.startsWith(prefix)),
    }),
    remove: async ({ key }) => {
      values.delete(key);
    },
    set: async ({ key, value }) => {
      values.set(key, value);
    },
    status: async () => status,
  };

  return { plugin, values };
};

describe("Capacitor secure storage", () => {
  test("isolates keys and reports native security capability", async () => {
    const { plugin, values } = createPlugin();
    const storage = createCapacitorSecureStorage({
      plugin,
      prefix: "absolute.test.",
    });

    expect(await storage.capability()).toEqual({
      available: true,
      fidelity: "native",
      native: {
        backend: "keystore",
        hardwareBacked: true,
        persistent: true,
        secure: true,
      },
    });
    await storage.set("refresh", "secret");
    expect(values.get("absolute.test.refresh")).toBe("secret");
    expect(await storage.get("refresh")).toBe("secret");
    expect(await storage.keys()).toEqual(["refresh"]);
    await storage.clear();
    expect(await storage.get("refresh")).toBeNull();
    expect(values.get("unrelated")).toBe("keep");
  });

  test("does not claim that an unavailable backend is secure", async () => {
    const { plugin } = createPlugin({
      backend: "unavailable",
      hardwareBacked: false,
      persistent: false,
      secure: false,
    });
    const storage = createCapacitorSecureStorage({ plugin });

    expect(await storage.capability()).toMatchObject({
      available: false,
      reason: "unavailable",
    });
  });

  test("rejects empty namespaces and keys", async () => {
    const { plugin } = createPlugin();
    expect(() => createCapacitorSecureStorage({ plugin, prefix: "" })).toThrow(
      "prefix cannot be empty",
    );
    const storage = createCapacitorSecureStorage({ plugin });
    await expect(storage.get("")).rejects.toThrow("key cannot be empty");
  });
});
