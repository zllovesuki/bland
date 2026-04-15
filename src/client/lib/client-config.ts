import { PublicClientConfig } from "@/shared/types";
import type { PublicClientConfig as PublicClientConfigType } from "@/shared/types";

declare global {
  interface Window {
    __BLAND_PUBLIC_CONFIG__?: unknown;
  }
}

type ClientConfigState = {
  config: PublicClientConfigType | null;
  error: Error | null;
};

let clientConfigState: ClientConfigState | null = null;

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

  const parsed = PublicClientConfig.safeParse(rawConfig);
  if (!parsed.success) {
    clientConfigState = {
      config: null,
      error: new Error("Invalid Worker bootstrap config", { cause: parsed.error }),
    };
    return clientConfigState;
  }

  clientConfigState = {
    config: parsed.data,
    error: null,
  };
  return clientConfigState;
}

export function getClientConfigSnapshot(): PublicClientConfigType | null {
  return resolveClientConfigState().config;
}

export function getClientConfigErrorSnapshot(): Error | null {
  return resolveClientConfigState().error;
}
