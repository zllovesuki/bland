import type { PublicClientConfig } from "@/shared/types";

declare global {
  interface Window {
    __BLAND_PUBLIC_CONFIG__?: unknown;
    __BLAND_CSP_NONCE__?: unknown;
  }
}

type ClientConfigState = {
  config: PublicClientConfig | null;
  error: Error | null;
};

let clientConfigState: ClientConfigState | null = null;

function isPublicClientConfig(rawConfig: unknown): rawConfig is PublicClientConfig {
  if (!rawConfig || typeof rawConfig !== "object") {
    return false;
  }

  const value = rawConfig as Record<string, unknown>;
  const turnstileSiteKey = value.turnstile_site_key;
  const sentryDsn = value.sentry_dsn;

  return (
    typeof turnstileSiteKey === "string" &&
    turnstileSiteKey.length > 0 &&
    (sentryDsn === null || (typeof sentryDsn === "string" && sentryDsn.length > 0))
  );
}

function resolveClientConfigState(): ClientConfigState {
  if (clientConfigState) {
    return clientConfigState;
  }

  const rawConfig = typeof window === "undefined" ? undefined : window.__BLAND_PUBLIC_CONFIG__;
  if (rawConfig === undefined) {
    clientConfigState = {
      config: null,
      error: new Error("Missing Worker bootstrap config"),
    };
    return clientConfigState;
  }

  if (!isPublicClientConfig(rawConfig)) {
    clientConfigState = {
      config: null,
      error: new Error("Invalid Worker bootstrap config"),
    };
    return clientConfigState;
  }

  clientConfigState = {
    config: rawConfig,
    error: null,
  };
  return clientConfigState;
}

export function getClientConfigSnapshot(): PublicClientConfig | null {
  return resolveClientConfigState().config;
}

export function getClientConfigErrorSnapshot(): Error | null {
  return resolveClientConfigState().error;
}

export function getBootstrapCspNonceSnapshot(): string | null {
  if (typeof window === "undefined") return null;
  return typeof window.__BLAND_CSP_NONCE__ === "string" && window.__BLAND_CSP_NONCE__.length > 0
    ? window.__BLAND_CSP_NONCE__
    : null;
}
