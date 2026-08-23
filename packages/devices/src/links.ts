import { DeviceError, type DeviceLink } from "./contracts";

const schemeOf = (url: URL) => url.protocol.replace(/:$/u, "").toLowerCase();

export const parseDeviceLink = (
  input: string | URL,
  base?: string | URL,
): DeviceLink => {
  let url: URL;
  try {
    url = input instanceof URL ? new URL(input.href) : new URL(input, base);
  } catch (cause) {
    throw new DeviceError("failed", "Device link is not a valid URL.", {
      cause,
    });
  }
  if (url.username || url.password)
    throw new DeviceError(
      "failed",
      "Device links must not contain embedded credentials.",
    );

  return {
    fragment: url.hash.replace(/^#/u, ""),
    host: url.host,
    href: url.href,
    pathname: url.pathname,
    query: new URLSearchParams(url.searchParams),
    scheme: schemeOf(url),
  };
};
