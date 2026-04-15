import { type PublicClientConfig } from "@/shared/types";

function serializeJsonForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function getPublicClientConfig(env: Pick<Env, "TURNSTILE_SITE_KEY" | "SENTRY_DSN">): PublicClientConfig {
  return {
    turnstile_site_key: env.TURNSTILE_SITE_KEY,
    sentry_dsn: env.SENTRY_DSN || null,
  };
}

export function createPublicClientConfigScript(env: Pick<Env, "TURNSTILE_SITE_KEY" | "SENTRY_DSN">): string {
  return `window.__BLAND_PUBLIC_CONFIG__=${serializeJsonForInlineScript(getPublicClientConfig(env))};`;
}

class HeadBootstrapInjector {
  constructor(private readonly script: string) {}

  element(element: Element) {
    element.append(`<script>${this.script}</script>`, { html: true });
  }
}

export async function renderSpaShell(
  request: Request,
  env: Pick<Env, "ASSETS" | "TURNSTILE_SITE_KEY" | "SENTRY_DSN">,
): Promise<Response> {
  const shell = await env.ASSETS.fetch(request);
  if (!shell.ok) {
    return shell;
  }

  return Promise.resolve(
    new HTMLRewriter().on("head", new HeadBootstrapInjector(createPublicClientConfigScript(env))).transform(shell),
  );
}
