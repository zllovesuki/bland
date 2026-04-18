import { type PublicClientConfig } from "@/shared/types";
import {
  applyBaselineSecurityHeaders,
  applyDocumentSecurityHeaders,
  createCspNonce,
} from "@/worker/lib/security-headers";

const SPA_SHELL_SOURCE_PATH = "/index.html";

type SpaShellHint = {
  href: string;
  rel: "preconnect" | "preload";
  as?: "script" | "style";
  crossorigin?: true;
};

type SpaShellHintsManifest = {
  links: SpaShellHint[];
};

let shellHintsPromise: Promise<SpaShellHintsManifest | null> | null = null;

function serializeJsonForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function getPublicClientConfig(env: Pick<Env, "TURNSTILE_SITE_KEY" | "SENTRY_DSN">): PublicClientConfig {
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

class ShellHintCollector {
  private readonly seen = new Set<string>();
  readonly links: SpaShellHint[] = [];

  private addLink(link: SpaShellHint) {
    const key = JSON.stringify(link);
    if (this.seen.has(key)) return;

    this.seen.add(key);
    this.links.push(link);
  }

  element(element: Element) {
    if (element.tagName === "script") {
      const src = element.getAttribute("src");
      if (element.getAttribute("type") === "module" && src) {
        this.addLink({
          href: src,
          rel: "preload",
          as: "script",
          crossorigin: element.hasAttribute("crossorigin") ? true : undefined,
        });
      }
      return;
    }

    if (element.tagName !== "link") {
      return;
    }

    const rel = element.getAttribute("rel");
    const href = element.getAttribute("href");
    if (!rel || !href) return;

    if (rel === "preconnect") {
      this.addLink({
        href,
        rel: "preconnect",
        crossorigin: element.hasAttribute("crossorigin") ? true : undefined,
      });
      return;
    }

    if (rel === "modulepreload" && href.startsWith("/")) {
      this.addLink({
        href,
        rel: "preload",
        as: "script",
        crossorigin: element.hasAttribute("crossorigin") ? true : undefined,
      });
      return;
    }

    if (rel === "stylesheet" && href.startsWith("/")) {
      this.addLink({
        href,
        rel: "preload",
        as: "style",
        crossorigin: element.hasAttribute("crossorigin") ? true : undefined,
      });
    }
  }
}

function createShellHintLinkValue(link: SpaShellHint): string {
  const parts = [`<${link.href}>`, `rel=${link.rel}`];
  if (link.as) parts.push(`as=${link.as}`);
  if (link.crossorigin) parts.push("crossorigin");
  return parts.join("; ");
}

function appendShellHintHeaders(headers: Headers, manifest: SpaShellHintsManifest | null): Headers {
  for (const link of manifest?.links ?? []) {
    headers.append("Link", createShellHintLinkValue(link));
  }
  return headers;
}

async function loadShellHints(request: Request, env: Pick<Env, "ASSETS">): Promise<SpaShellHintsManifest | null> {
  const url = new URL(SPA_SHELL_SOURCE_PATH, request.url);
  const response = await env.ASSETS.fetch(new Request(url.toString()));
  if (!response.ok) return null;

  const collector = new ShellHintCollector();
  const parsed = await Promise.resolve(
    new HTMLRewriter().on("script", collector).on("link", collector).transform(response),
  );
  await parsed.arrayBuffer();
  return { links: collector.links };
}

async function getShellHints(request: Request, env: Pick<Env, "ASSETS">): Promise<SpaShellHintsManifest | null> {
  shellHintsPromise ??= loadShellHints(request, env).catch(() => null);
  return shellHintsPromise;
}

export function resetShellHintsCacheForTests() {
  shellHintsPromise = null;
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
  const transformed = await Promise.resolve(
    new HTMLRewriter()
      .on("head", new HeadBootstrapInjector(createPublicClientConfigScript(env, nonce), nonce))
      .on("script", new ScriptNonceInjector(nonce))
      .transform(shell),
  );

  const response = new Response(transformed.body, {
    status: transformed.status,
    statusText: transformed.statusText,
    headers: appendShellHintHeaders(new Headers(transformed.headers), await getShellHints(request, env)),
  });

  return applyDocumentSecurityHeaders(response, {
    nonce,
    requestUrl: request.url,
    sentryDsn: env.SENTRY_DSN || null,
  });
}
