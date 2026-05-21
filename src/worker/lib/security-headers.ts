import { isLocalRequestUrl } from "@/worker/http";
import { base64UrlEncode } from "@/lib/encoding";

const REFERRER_POLICY = "strict-origin-when-cross-origin";
const CLOUDFLARE_ANALYTICS_ORIGIN = "https://static.cloudflareinsights.com";
const CLOUDFLARE_ANALYTICS_CONNECT_ORIGIN = "https://cloudflareinsights.com";
// Excalidraw's ExcalidrawFontFace unconditionally appends its esm.sh fallback
// URL to every generated `@font-face` src list — even when the primary
// (self-hosted via EXCALIDRAW_ASSET_PATH) resolves. The browser honors the
// primary but still surfaces a CSP violation for the fallback unless we
// allowlist it. Fonts-only; canvas surface only uses this for its built-in
// font set.
const EXCALIDRAW_FONTS_FALLBACK_ORIGIN = "https://esm.sh";

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
    CLOUDFLARE_ANALYTICS_CONNECT_ORIGIN,
    ...(isLocal ? ["http:", "https:", "ws:", "wss:"] : []),
    ...(sentryOrigin ? [sentryOrigin] : []),
  ];
  const scriptSrc = isLocal
    ? ["'self'", CLOUDFLARE_ANALYTICS_ORIGIN, "'unsafe-inline'", "'unsafe-eval'"]
    : ["'self'", `'nonce-${nonce}'`, CLOUDFLARE_ANALYTICS_ORIGIN];

  const directives = [
    joinDirective("default-src", ["'self'"]),
    joinDirective("base-uri", ["'self'"]),
    joinDirective("object-src", ["'none'"]),
    joinDirective("frame-ancestors", ["'none'"]),
    joinDirective("form-action", ["'self'"]),
    joinDirective("script-src", scriptSrc),
    joinDirective("connect-src", connectSrc),
    joinDirective("style-src", ["'self'", "'unsafe-inline'"]),
    joinDirective("font-src", ["'self'", EXCALIDRAW_FONTS_FALLBACK_ORIGIN]),
    joinDirective("img-src", ["'self'", "data:", "blob:", "https:"]),
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

// Strict CSP for the public Sites surface. Scripts are same-origin plus
// Cloudflare Web Analytics only; no inline scripts, eval, or broad third-party
// connect/script origins. Emoji fallback images come from jsdelivr (per the
// Tiptap emoji extension); the rest of img-src stays narrow.
const EMOJI_FALLBACK_ORIGIN = "https://cdn.jsdelivr.net";
const SITES_CSP_PROD = [
  "default-src 'self'",
  `script-src 'self' ${CLOUDFLARE_ANALYTICS_ORIGIN}`,
  `connect-src 'self' ${CLOUDFLARE_ANALYTICS_CONNECT_ORIGIN}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: ${EMOJI_FALLBACK_ORIGIN}`,
  "font-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");

// Localhost-only relaxation. Vite's HMR client injects inline scripts and
// requires `unsafe-eval` plus a WebSocket connection. `applySitesSecurityHeaders`
// picks this variant only when the request URL passes `isLocalRequestUrl`, so
// deployed Sites responses (non-localhost host) always get the prod CSP above.
const SITES_CSP_DEV = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "connect-src 'self' http: https: ws: wss:",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${EMOJI_FALLBACK_ORIGIN}`,
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");

export function applySitesSecurityHeaders(response: Response, requestUrl?: string): Response {
  const next = applyBaselineSecurityHeaders(response);
  const csp = requestUrl && isLocalRequestUrl(requestUrl) ? SITES_CSP_DEV : SITES_CSP_PROD;
  next.headers.set("Content-Security-Policy", csp);
  next.headers.set("X-Frame-Options", "DENY");
  return next;
}
