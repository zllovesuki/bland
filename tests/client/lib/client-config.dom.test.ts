import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  delete window.__BLAND_PUBLIC_CONFIG__;
  delete window.__BLAND_CSP_NONCE__;
  vi.restoreAllMocks();
});

describe("client config bootstrap", () => {
  it("reads and memoizes Worker-injected bootstrap config", async () => {
    window.__BLAND_PUBLIC_CONFIG__ = {
      turnstile_site_key: "turnstile-test-key",
      sentry_dsn: "https://public@example.ingest.sentry.io/1",
    };
    window.__BLAND_CSP_NONCE__ = "nonce-test";

    const clientConfig = await import("@/client/lib/client-config");

    expect(clientConfig.getClientConfigSnapshot()).toEqual({
      turnstile_site_key: "turnstile-test-key",
      sentry_dsn: "https://public@example.ingest.sentry.io/1",
    });
    expect(clientConfig.getBootstrapCspNonceSnapshot()).toBe("nonce-test");
    expect(clientConfig.getClientConfigErrorSnapshot()).toBeNull();

    window.__BLAND_PUBLIC_CONFIG__ = {
      turnstile_site_key: "changed-after-read",
      sentry_dsn: null,
    };

    expect(clientConfig.getClientConfigSnapshot()).toEqual({
      turnstile_site_key: "turnstile-test-key",
      sentry_dsn: "https://public@example.ingest.sentry.io/1",
    });
  });

  it("returns a stable error when the Worker bootstrap config is missing", async () => {
    const clientConfig = await import("@/client/lib/client-config");

    expect(clientConfig.getClientConfigSnapshot()).toBeNull();
    expect(clientConfig.getBootstrapCspNonceSnapshot()).toBeNull();
    expect(clientConfig.getClientConfigErrorSnapshot()).toEqual(
      expect.objectContaining({ message: "Missing Worker bootstrap config" }),
    );
  });

  it("returns a stable error when the Worker bootstrap config is invalid", async () => {
    window.__BLAND_PUBLIC_CONFIG__ = {
      turnstile_site_key: "",
      sentry_dsn: 123,
    };

    const clientConfig = await import("@/client/lib/client-config");

    expect(clientConfig.getClientConfigSnapshot()).toBeNull();
    expect(clientConfig.getClientConfigErrorSnapshot()).toEqual(
      expect.objectContaining({ message: "Invalid Worker bootstrap config" }),
    );
  });
});
