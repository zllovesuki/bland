import { type PublicClientConfig } from "@/shared/types";
import {
  applyBaselineSecurityHeaders,
  applyDocumentSecurityHeaders,
  createCspNonce,
} from "@/worker/lib/security-headers";

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

export function createPublicClientConfigScript(
  env: Pick<Env, "TURNSTILE_SITE_KEY" | "SENTRY_DSN">,
  cspNonce?: string,
): string {
  let script = `window.__BLAND_PUBLIC_CONFIG__=${serializeJsonForInlineScript(getPublicClientConfig(env))};`;
  if (cspNonce) {
    script += `window.__BLAND_CSP_NONCE__=${serializeJsonForInlineScript(cspNonce)};`;
  }
  return script;
}

class HeadBootstrapInjector {
  constructor(
    private readonly script: string,
    private readonly nonce: string,
  ) {}

  element(element: Element) {
    element.append(`<script nonce="${this.nonce}">${this.script}</script>`, { html: true });
  }
}

class ScriptNonceInjector {
  constructor(private readonly nonce: string) {}

  element(element: Element) {
    element.setAttribute("nonce", this.nonce);
  }
}

export async function renderSpaShell(
  request: Request,
  env: Pick<Env, "ASSETS" | "TURNSTILE_SITE_KEY" | "SENTRY_DSN">,
): Promise<Response> {
  const shell = await env.ASSETS.fetch(request);
  if (!shell.ok) {
    return applyBaselineSecurityHeaders(shell);
  }

  const nonce = createCspNonce();
  const response = await Promise.resolve(
    new HTMLRewriter()
      .on("head", new HeadBootstrapInjector(createPublicClientConfigScript(env, nonce), nonce))
      .on("script", new ScriptNonceInjector(nonce))
      .transform(shell),
  );

  return applyDocumentSecurityHeaders(response, {
    nonce,
    requestUrl: request.url,
    sentryDsn: env.SENTRY_DSN || null,
  });
}
