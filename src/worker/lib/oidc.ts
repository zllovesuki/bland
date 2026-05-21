import * as oidc from "openid-client";
import type { AuthorizationCodeGrantChecks, Configuration, DiscoveryRequestOptions, IDToken } from "openid-client";
import { OIDC_RETURN_MARKER, OIDC_TX_COOKIE } from "@/shared/auth";
import { base64UrlDecode, base64UrlEncode } from "@/lib/encoding";

const DISCOVERY_TTL_MS = 5 * 60 * 1000;
const HKDF_PURPOSE = "bland-oidc-transaction-v1";
const HKDF_INFO = new TextEncoder().encode(HKDF_PURPOSE);

export const OIDC_TX_COOKIE_MAX_AGE = 300;
export const OIDC_SCOPE = "openid email profile";

export { OIDC_TX_COOKIE, OIDC_RETURN_MARKER };

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

export interface OidcConfigEnv {
  TESSERA_OIDC_ISSUER?: string;
  TESSERA_OIDC_CLIENT_ID?: string;
  TESSERA_OIDC_CLIENT_SECRET?: string;
}

export interface OidcSettings {
  issuer: string;
  clientId: string;
  clientSecret: string;
}

export interface TxCookiePayload {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  returnTo: string;
  createdAt: number;
}

export interface ResolvedClaims {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
}

export type ClaimValidation = { ok: true; claims: ResolvedClaims } | { ok: false; code: ClaimRejectionCode };

export type ClaimRejectionCode = "oidc_unverified_email";

interface DiscoveryCacheEntry {
  promise: Promise<Configuration>;
  expiresAt: number;
}

const discoveryCache = new Map<string, DiscoveryCacheEntry>();

type AuthorizationCodeGrantImpl = (
  config: Configuration,
  url: URL,
  checks: AuthorizationCodeGrantChecks,
) => Promise<{ claims(): IDToken | undefined }>;

let testConfigOverride: { issuer: string; config: Configuration } | null = null;
let testAuthorizationCodeGrantImpl: AuthorizationCodeGrantImpl | null = null;
let testHkdfKeyOverride: CryptoKey | null = null;

export function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname);
}

export function validateIssuerUrl(rawIssuer: string | undefined): URL {
  if (!rawIssuer) {
    throw new Error("TESSERA_OIDC_ISSUER is required");
  }
  const trimmed = rawIssuer.trim().replace(/\/$/, "");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`TESSERA_OIDC_ISSUER is not a valid URL: ${rawIssuer}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`TESSERA_OIDC_ISSUER must use http(s): ${rawIssuer}`);
  }
  if (url.protocol === "http:" && !isLoopbackHostname(url.hostname)) {
    throw new Error(`TESSERA_OIDC_ISSUER must use https unless loopback: ${rawIssuer}`);
  }
  return url;
}

export function loadOidcSettings(env: OidcConfigEnv): OidcSettings {
  const issuerUrl = validateIssuerUrl(env.TESSERA_OIDC_ISSUER);
  const clientId = env.TESSERA_OIDC_CLIENT_ID?.trim();
  const clientSecret = env.TESSERA_OIDC_CLIENT_SECRET?.trim();
  if (!clientId) throw new Error("TESSERA_OIDC_CLIENT_ID is required");
  if (!clientSecret) throw new Error("TESSERA_OIDC_CLIENT_SECRET is required");
  return { issuer: issuerUrl.toString(), clientId, clientSecret };
}

function validateDiscoveredEndpoint(name: string, raw: string | undefined, issuerUrl: URL): void {
  if (!raw) {
    throw new Error(`OIDC discovery returned no ${name}`);
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`OIDC ${name} is not a valid URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`OIDC ${name} must use http(s): ${raw}`);
  }
  if (url.protocol === "http:" && !isLoopbackHostname(url.hostname)) {
    throw new Error(`OIDC ${name} must use https unless loopback: ${raw}`);
  }
  if (url.hostname !== issuerUrl.hostname) {
    throw new Error(`OIDC ${name} host ${url.hostname} does not match issuer host ${issuerUrl.hostname}`);
  }
}

export async function getOidcConfig(env: OidcConfigEnv): Promise<Configuration> {
  const settings = loadOidcSettings(env);
  const issuerUrl = new URL(settings.issuer);

  if (testConfigOverride && testConfigOverride.issuer === settings.issuer) {
    return testConfigOverride.config;
  }

  const cacheKey = settings.issuer;
  const cached = discoveryCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const discoveryOptions: DiscoveryRequestOptions = isLoopbackHostname(issuerUrl.hostname)
    ? // openid-client marks this deprecated to make non-TLS use stand out. This
      // code path is intentionally limited to loopback development/test issuers.
      { execute: [oidc.allowInsecureRequests] }
    : {};

  const promise = oidc
    .discovery(issuerUrl, settings.clientId, undefined, oidc.ClientSecretPost(settings.clientSecret), discoveryOptions)
    .then((config) => {
      const meta = config.serverMetadata();
      validateDiscoveredEndpoint("authorization_endpoint", meta.authorization_endpoint, issuerUrl);
      validateDiscoveredEndpoint("token_endpoint", meta.token_endpoint, issuerUrl);
      validateDiscoveredEndpoint("jwks_uri", meta.jwks_uri, issuerUrl);
      return config;
    });

  promise.catch(() => {
    const current = discoveryCache.get(cacheKey);
    if (current?.promise === promise) {
      discoveryCache.delete(cacheKey);
    }
  });

  discoveryCache.set(cacheKey, { promise, expiresAt: now + DISCOVERY_TTL_MS });
  return promise;
}

export async function exchangeAuthorizationCode(
  config: Configuration,
  url: URL,
  checks: AuthorizationCodeGrantChecks,
): Promise<{ claims(): IDToken | undefined }> {
  // ADR: `return await` (not bare `return`) so a synchronous reject from a
  // test stub is chained into this async function's promise within the same
  // microtask. Without the await, V8 reports the inner rejection as
  // unhandled even though the caller awaits the wrapper.
  if (testAuthorizationCodeGrantImpl) {
    return await testAuthorizationCodeGrantImpl(config, url, checks);
  }
  return await oidc.authorizationCodeGrant(config, url, checks);
}

export function validateClaims(raw: IDToken | undefined): ClaimValidation {
  if (!raw) {
    return { ok: false, code: "oidc_unverified_email" };
  }
  const sub = typeof raw.sub === "string" ? raw.sub.trim() : "";
  const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
  const emailVerified = raw.email_verified === true;
  const name = typeof raw.name === "string" && raw.name.trim().length > 0 ? raw.name.trim() : undefined;

  if (!sub || !email || !emailVerified) {
    return { ok: false, code: "oidc_unverified_email" };
  }

  return { ok: true, claims: { sub, email, email_verified: true, name } };
}

export function oidcErrorContext(error: unknown, env?: OidcConfigEnv): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const issuer = issuerForLog(env);
  if (issuer) {
    fields.configuredIssuer = issuer;
  }

  addErrorFields(fields, "", error);
  const issuerComparison = findIssuerComparison(error);
  if (issuerComparison) {
    fields.expectedIssuer = issuerComparison.expected;
    fields.discoveredIssuer = issuerComparison.discovered;
  }

  return fields;
}

function issuerForLog(env: OidcConfigEnv | undefined): string | undefined {
  const raw = env?.TESSERA_OIDC_ISSUER?.trim();
  if (!raw) return undefined;
  try {
    return validateIssuerUrl(raw).toString();
  } catch {
    return raw;
  }
}

function addErrorFields(fields: Record<string, unknown>, prefix: "" | "cause", error: unknown): void {
  if (error instanceof Error) {
    fields[errorField(prefix, "Name")] = error.name;
    fields[errorField(prefix, "Message")] = error.message;
    const code = errorCode(error);
    if (code) {
      fields[errorField(prefix, "Code")] = code;
    }
    const cause = error.cause;
    if (prefix === "" && cause) {
      addErrorFields(fields, "cause", cause);
    }
    return;
  }

  fields[errorField(prefix, "Message")] = String(error);
}

function errorField(prefix: "" | "cause", suffix: "Name" | "Message" | "Code"): string {
  if (!prefix) {
    return `error${suffix}`;
  }
  return `${prefix}Error${suffix}`;
}

function errorCode(error: Error): string | undefined {
  const code = (error as Error & { code?: unknown }).code;
  return typeof code === "string" && code.length > 0 ? code : undefined;
}

function findIssuerComparison(value: unknown, depth = 0): { expected: string; discovered: string } | undefined {
  if (depth > 4 || !isRecord(value)) return undefined;

  const cause = value.cause;
  if (isRecord(cause)) {
    if (cause.attribute === "issuer" && typeof cause.expected === "string") {
      const body = cause.body;
      if (isRecord(body) && typeof body.issuer === "string") {
        return { expected: cause.expected, discovered: body.issuer };
      }
    }
    return findIssuerComparison(cause, depth + 1);
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function sanitizeReturnTo(raw: string | undefined): string {
  if (!raw) return "/";
  const v = raw.trim();
  if (!v.startsWith("/") || v.startsWith("//")) return "/";
  if (v.includes("://") || v.includes("\\")) return "/";
  for (let i = 0; i < v.length; i++) {
    const code = v.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return "/";
  }
  return v;
}

export function appendOidcMarker(path: string): string {
  const hashIdx = path.indexOf("#");
  const hash = hashIdx >= 0 ? path.slice(hashIdx) : "";
  const withoutHash = hashIdx >= 0 ? path.slice(0, hashIdx) : path;
  const queryIdx = withoutHash.indexOf("?");
  const pathname = queryIdx >= 0 ? withoutHash.slice(0, queryIdx) : withoutHash;
  const search = queryIdx >= 0 ? withoutHash.slice(queryIdx + 1) : "";
  const params = new URLSearchParams(search);
  params.set(OIDC_RETURN_MARKER, "1");
  return `${pathname}?${params.toString()}${hash}`;
}

async function getHkdfKey(clientSecret: string): Promise<CryptoKey> {
  if (testHkdfKeyOverride) return testHkdfKeyOverride;
  const ikm = new TextEncoder().encode(clientSecret);
  const baseKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: HKDF_INFO },
    baseKey,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign", "verify"],
  );
}

export async function encodeTxCookie(env: OidcConfigEnv, payload: TxCookiePayload): Promise<string> {
  const { clientSecret } = loadOidcSettings(env);
  const json = JSON.stringify(payload);
  const valueB64 = base64UrlEncode(new TextEncoder().encode(json));
  const key = await getHkdfKey(clientSecret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(valueB64));
  const sigB64 = base64UrlEncode(new Uint8Array(signature));
  return `${valueB64}.${sigB64}`;
}

export async function decodeTxCookie(
  env: OidcConfigEnv,
  cookieValue: string | undefined,
): Promise<TxCookiePayload | null> {
  if (!cookieValue) return null;
  const lastDot = cookieValue.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const valueB64 = cookieValue.slice(0, lastDot);
  const sigB64 = cookieValue.slice(lastDot + 1);

  let key: CryptoKey;
  let sig: Uint8Array;
  try {
    const { clientSecret } = loadOidcSettings(env);
    key = await getHkdfKey(clientSecret);
    sig = base64UrlDecode(sigB64);
  } catch {
    return null;
  }

  const ok = await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(valueB64));
  if (!ok) return null;

  try {
    const json = new TextDecoder().decode(base64UrlDecode(valueB64));
    const parsed = JSON.parse(json) as Partial<TxCookiePayload>;
    if (
      typeof parsed.state !== "string" ||
      typeof parsed.nonce !== "string" ||
      typeof parsed.codeVerifier !== "string" ||
      typeof parsed.redirectUri !== "string" ||
      typeof parsed.returnTo !== "string" ||
      typeof parsed.createdAt !== "number"
    ) {
      return null;
    }
    if (Date.now() - parsed.createdAt > OIDC_TX_COOKIE_MAX_AGE * 1000) {
      return null;
    }
    return parsed as TxCookiePayload;
  } catch {
    return null;
  }
}

export const __test = {
  setProviderForTesting(issuer: string, config: oidc.Configuration): void {
    testConfigOverride = { issuer: validateIssuerUrl(issuer).toString(), config };
  },
  setAuthorizationCodeGrantImpl(fn: AuthorizationCodeGrantImpl | null): void {
    testAuthorizationCodeGrantImpl = fn;
  },
  setHkdfKeyOverride(key: CryptoKey | null): void {
    testHkdfKeyOverride = key;
  },
  clear(): void {
    testConfigOverride = null;
    testAuthorizationCodeGrantImpl = null;
    testHkdfKeyOverride = null;
    discoveryCache.clear();
  },
};
