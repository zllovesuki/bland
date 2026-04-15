import { isLocalRequestUrl } from "@/worker/http";

const REFERRER_POLICY = "strict-origin-when-cross-origin";
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
const CLOUDFLARE_ANALYTICS_ORIGIN = "https://static.cloudflareinsights.com";
const CLOUDFLARE_ANALYTICS_CONNECT_ORIGIN = "https://cloudflareinsights.com";
const GOOGLE_FONTS_STYLES_ORIGIN = "https://fonts.googleapis.com";
const GOOGLE_FONTS_ASSETS_ORIGIN = "https://fonts.gstatic.com";

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function cloneResponse(response: Response): Response {
  return new Response(response.body, response);
}

function maybeGetSentryOrigin(dsn: string | null | undefined): string | null {
  if (!dsn) return null;

  try {
    return new URL(dsn).origin;
  } catch {
    return null;
  }
}

function joinDirective(name: string, values: string[]): string {
  return values.length > 0 ? `${name} ${values.join(" ")}` : name;
}

export function createCspNonce(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
}

export function buildDocumentCsp(options: { nonce: string; requestUrl: string; sentryDsn?: string | null }): string {
  const { nonce, requestUrl, sentryDsn } = options;
  const isLocal = isLocalRequestUrl(requestUrl);
  const sentryOrigin = maybeGetSentryOrigin(sentryDsn);
  const connectSrc = [
    "'self'",
    TURNSTILE_ORIGIN,
    CLOUDFLARE_ANALYTICS_CONNECT_ORIGIN,
    ...(isLocal ? ["http:", "https:", "ws:", "wss:"] : []),
    ...(sentryOrigin ? [sentryOrigin] : []),
  ];
  const scriptSrc = isLocal
    ? ["'self'", TURNSTILE_ORIGIN, CLOUDFLARE_ANALYTICS_ORIGIN, "'unsafe-inline'", "'unsafe-eval'"]
    : ["'self'", `'nonce-${nonce}'`, TURNSTILE_ORIGIN, CLOUDFLARE_ANALYTICS_ORIGIN];

  const directives = [
    joinDirective("default-src", ["'self'"]),
    joinDirective("base-uri", ["'self'"]),
    joinDirective("object-src", ["'none'"]),
    joinDirective("frame-ancestors", ["'none'"]),
    joinDirective("form-action", ["'self'"]),
    joinDirective("script-src", scriptSrc),
    joinDirective("connect-src", connectSrc),
    joinDirective("style-src", ["'self'", "'unsafe-inline'", GOOGLE_FONTS_STYLES_ORIGIN]),
    joinDirective("font-src", ["'self'", GOOGLE_FONTS_ASSETS_ORIGIN]),
    joinDirective("img-src", ["'self'", "data:", "blob:", "https:"]),
    joinDirective("frame-src", [TURNSTILE_ORIGIN]),
    ...(!isLocal ? ["upgrade-insecure-requests"] : []),
  ];

  return directives.join("; ");
}

export function applyBaselineSecurityHeaders(response: Response): Response {
  const next = cloneResponse(response);
  next.headers.set("Referrer-Policy", REFERRER_POLICY);
  next.headers.set("X-Content-Type-Options", "nosniff");
  return next;
}

export function applyDocumentSecurityHeaders(
  response: Response,
  options: { nonce: string; requestUrl: string; sentryDsn?: string | null },
): Response {
  const next = applyBaselineSecurityHeaders(response);
  next.headers.set("Content-Security-Policy", buildDocumentCsp(options));
  next.headers.set("X-Frame-Options", "DENY");
  return next;
}
