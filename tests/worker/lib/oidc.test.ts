import { afterEach, describe, expect, it } from "vitest";
import {
  __test,
  appendOidcMarker,
  decodeTxCookie,
  encodeTxCookie,
  oidcErrorContext,
  sanitizeReturnTo,
  validateIssuerUrl,
  type OidcConfigEnv,
  type TxCookiePayload,
} from "@/worker/lib/oidc";

const env: OidcConfigEnv = {
  TESSERA_OIDC_ISSUER: "https://tessera.test",
  TESSERA_OIDC_CLIENT_ID: "bland-test",
  TESSERA_OIDC_CLIENT_SECRET: "test-secret-deterministic",
};

afterEach(() => {
  __test.clear();
});

describe("sanitizeReturnTo", () => {
  it("returns / for missing or empty input", () => {
    expect(sanitizeReturnTo(undefined)).toBe("/");
    expect(sanitizeReturnTo("")).toBe("/");
    expect(sanitizeReturnTo("   ")).toBe("/");
  });

  it("rejects non-absolute paths", () => {
    expect(sanitizeReturnTo("workspaces")).toBe("/");
    expect(sanitizeReturnTo("./inner")).toBe("/");
  });

  it("rejects protocol-relative and scheme-bearing urls", () => {
    expect(sanitizeReturnTo("//evil.example")).toBe("/");
    expect(sanitizeReturnTo("javascript:alert(1)")).toBe("/");
    expect(sanitizeReturnTo("https://evil.example/path")).toBe("/");
    expect(sanitizeReturnTo("/path?next=https://evil.example")).toBe("/");
  });

  it("rejects backslashes", () => {
    expect(sanitizeReturnTo("/path\\back")).toBe("/");
  });

  it("rejects control characters", () => {
    expect(sanitizeReturnTo("/path\x00x")).toBe("/");
    expect(sanitizeReturnTo("/path\x1fx")).toBe("/");
    expect(sanitizeReturnTo("/path\x7fx")).toBe("/");
  });

  it("preserves a valid path including query and fragment", () => {
    expect(sanitizeReturnTo("/invite/abc?accept=1")).toBe("/invite/abc?accept=1");
    expect(sanitizeReturnTo("/workspaces/foo#bar")).toBe("/workspaces/foo#bar");
  });
});

describe("validateIssuerUrl", () => {
  it("requires https unless loopback", () => {
    expect(() => validateIssuerUrl("http://example.com")).toThrow();
    expect(validateIssuerUrl("https://example.com").origin).toBe("https://example.com");
    expect(validateIssuerUrl("http://localhost:8787").origin).toBe("http://localhost:8787");
    expect(validateIssuerUrl("http://127.0.0.1:8787").origin).toBe("http://127.0.0.1:8787");
  });

  it("rejects missing values", () => {
    expect(() => validateIssuerUrl(undefined)).toThrow();
    expect(() => validateIssuerUrl("")).toThrow();
  });

  it("rejects unknown protocols", () => {
    expect(() => validateIssuerUrl("ftp://example.com")).toThrow();
  });

  it("strips a trailing slash", () => {
    const url = validateIssuerUrl("https://example.com/");
    expect(url.toString()).toBe("https://example.com/");
  });
});

describe("oidcErrorContext", () => {
  it("keeps the openid-client cause chain and issuer mismatch details", () => {
    const configuredIssuer = "http://127.0.0.1:8787/";
    const discoveredIssuer = "http://localhost:8787/";
    const cause = new Error("unexpected JSON attribute value encountered");
    Object.assign(cause, {
      code: "OAUTH_JSON_ATTRIBUTE_COMPARISON_FAILED",
      cause: {
        expected: configuredIssuer,
        body: { issuer: discoveredIssuer },
        attribute: "issuer",
      },
    });
    const err = new Error("something went wrong", { cause });

    expect(oidcErrorContext(err, { ...env, TESSERA_OIDC_ISSUER: configuredIssuer })).toMatchObject({
      configuredIssuer,
      errorName: "Error",
      errorMessage: "something went wrong",
      causeErrorName: "Error",
      causeErrorMessage: "unexpected JSON attribute value encountered",
      causeErrorCode: "OAUTH_JSON_ATTRIBUTE_COMPARISON_FAILED",
      expectedIssuer: configuredIssuer,
      discoveredIssuer,
    });
  });
});

describe("appendOidcMarker", () => {
  it("appends oidc=1 to a bare path", () => {
    expect(appendOidcMarker("/")).toBe("/?oidc=1");
    expect(appendOidcMarker("/invite/abc")).toBe("/invite/abc?oidc=1");
  });

  it("preserves existing query string", () => {
    expect(appendOidcMarker("/invite/abc?accept=1")).toBe("/invite/abc?accept=1&oidc=1");
  });

  it("preserves a hash", () => {
    expect(appendOidcMarker("/page#anchor")).toBe("/page?oidc=1#anchor");
    expect(appendOidcMarker("/page?x=1#anchor")).toBe("/page?x=1&oidc=1#anchor");
  });
});

describe("tx cookie sign/verify", () => {
  const payload: TxCookiePayload = {
    state: "state-value",
    nonce: "nonce-value",
    codeVerifier: "code-verifier-1234567890",
    redirectUri: "https://bland.test/api/v1/oidc/callback",
    returnTo: "/",
    createdAt: Date.now(),
  };

  it("round-trips a payload", async () => {
    const cookie = await encodeTxCookie(env, payload);
    const decoded = await decodeTxCookie(env, cookie);
    expect(decoded).toEqual(payload);
  });

  it("rejects a tampered cookie", async () => {
    const cookie = await encodeTxCookie(env, payload);
    // Flip a character in the payload portion
    const idx = cookie.indexOf(".");
    const tampered = `${cookie.slice(0, 1)}X${cookie.slice(2, idx)}${cookie.slice(idx)}`;
    const decoded = await decodeTxCookie(env, tampered);
    expect(decoded).toBeNull();
  });

  it("rejects a cookie signed with a different secret", async () => {
    const cookie = await encodeTxCookie(env, payload);
    const altEnv: OidcConfigEnv = { ...env, TESSERA_OIDC_CLIENT_SECRET: "different-secret" };
    const decoded = await decodeTxCookie(altEnv, cookie);
    expect(decoded).toBeNull();
  });

  it("rejects an expired cookie", async () => {
    const old: TxCookiePayload = { ...payload, createdAt: Date.now() - 10 * 60 * 1000 };
    const cookie = await encodeTxCookie(env, old);
    const decoded = await decodeTxCookie(env, cookie);
    expect(decoded).toBeNull();
  });

  it("returns null for missing or malformed input", async () => {
    expect(await decodeTxCookie(env, undefined)).toBeNull();
    expect(await decodeTxCookie(env, "")).toBeNull();
    expect(await decodeTxCookie(env, "no-dot")).toBeNull();
  });
});
