import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import * as oidc from "openid-client";

import { __test, OIDC_TX_COOKIE, encodeTxCookie, type ResolvedClaims, type TxCookiePayload } from "@/worker/lib/oidc";
import { memberships, tesseraIdentities, users, workspaces } from "@/worker/db/d1/schema";
import { getDb, resetD1Tables } from "@tests/worker/helpers/db";
import { apiRequest, LOOPBACK_ORIGIN } from "@tests/worker/helpers/request";
import { seedTesseraIdentity, seedUser, seedWorkspace } from "@tests/worker/helpers/seeds";

const ISSUER = "https://tessera.test";
const CALLBACK_ORIGIN = LOOPBACK_ORIGIN;
const REDIRECT_URI = `${CALLBACK_ORIGIN}/api/v1/oidc/callback`;

// Loopback bypasses RL_AUTH (rate-limit middleware short-circuits for
// localhost/127.0.0.1 hosts), so every test here shares one ungated bucket.
// For tests that need a non-loopback origin (to exercise the origin gate),
// the per-test IP keeps the production-mode bucket isolated.
let ipCounter = 0;
function uniqueIpHeaders(): Record<string, string> {
  ipCounter += 1;
  return { "cf-connecting-ip": `10.0.${Math.floor(ipCounter / 256)}.${ipCounter % 256}` };
}
const STATE = "test-state-deterministic";
const NONCE = "test-nonce-deterministic";

function buildConfig(): oidc.Configuration {
  return new oidc.Configuration(
    {
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      jwks_uri: `${ISSUER}/jwks`,
      response_types_supported: ["code"],
    },
    "bland-test",
    "test-tessera-client-secret-deterministic",
  );
}

async function buildTxCookieHeader(overrides: Partial<TxCookiePayload> = {}): Promise<string> {
  const payload: TxCookiePayload = {
    state: STATE,
    nonce: NONCE,
    codeVerifier: "test-code-verifier-deterministic-1234567890",
    redirectUri: REDIRECT_URI,
    returnTo: "/",
    createdAt: Date.now(),
    ...overrides,
  };
  const value = await encodeTxCookie(env, payload);
  return `${OIDC_TX_COOKIE}=${value}`;
}

function buildClaims(overrides: Partial<ResolvedClaims & { email_verified: boolean }> = {}): oidc.IDToken {
  return {
    iss: ISSUER,
    aud: "bland-test",
    exp: Math.floor(Date.now() / 1000) + 300,
    iat: Math.floor(Date.now() / 1000),
    sub: overrides.sub ?? "tessera-sub-1",
    email: overrides.email ?? "user@example.com",
    email_verified: overrides.email_verified ?? true,
    name: overrides.name ?? "Test User",
  } as oidc.IDToken;
}

function stubClaims(claims: oidc.IDToken | undefined): void {
  __test.setAuthorizationCodeGrantImpl(async () => ({
    claims: () => claims,
  }));
}

function stubClaimsThrows(message: string): void {
  __test.setAuthorizationCodeGrantImpl(async () => {
    throw new Error(message);
  });
}

async function callOidcCallback(
  opts: {
    cookie?: string;
    state?: string;
  } = {},
): Promise<Response> {
  const search: Record<string, string> = { code: "auth-code", state: opts.state ?? STATE };
  return apiRequest("/api/v1/oidc/callback", {
    method: "GET",
    origin: CALLBACK_ORIGIN,
    cookie: opts.cookie,
    search,
    redirect: "manual",
  });
}

describe("OIDC callback identity binding", () => {
  beforeEach(async () => {
    await resetD1Tables();
    __test.setProviderForTesting(ISSUER, buildConfig());
  });

  afterEach(() => {
    __test.clear();
  });

  it("returning sub with matching email signs in and updates last_seen_at", async () => {
    const user = await seedUser({ email: "user@example.com", name: "Existing User" });
    await seedTesseraIdentity({ sub: "tessera-sub-1", user_id: user.id });
    stubClaims(buildClaims({ sub: "tessera-sub-1", email: "user@example.com" }));

    const cookie = await buildTxCookieHeader();
    const res = await callOidcCallback({ cookie });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("oidc=1");
    expect(res.headers.get("set-cookie")).toContain("bland_refresh=");

    const identity = await getDb()
      .select()
      .from(tesseraIdentities)
      .where(eq(tesseraIdentities.sub, "tessera-sub-1"))
      .get();
    expect(identity?.last_seen_at).not.toBeNull();

    const updated = await getDb().select().from(users).where(eq(users.id, user.id)).get();
    expect(updated?.email).toBe("user@example.com");
  });

  it("returning sub with changed-but-free email updates users.email", async () => {
    const user = await seedUser({ email: "old@example.com", name: "Existing User" });
    await seedTesseraIdentity({ sub: "tessera-sub-1", user_id: user.id });
    stubClaims(buildClaims({ sub: "tessera-sub-1", email: "new@example.com" }));

    const cookie = await buildTxCookieHeader();
    const res = await callOidcCallback({ cookie });

    expect(res.status).toBe(302);

    const updated = await getDb().select().from(users).where(eq(users.id, user.id)).get();
    expect(updated?.email).toBe("new@example.com");
  });

  it("returning sub colliding with another user's email fails closed", async () => {
    const userA = await seedUser({ email: "old@example.com" });
    await seedUser({ email: "taken@example.com" });
    await seedTesseraIdentity({ sub: "tessera-sub-1", user_id: userA.id });
    stubClaims(buildClaims({ sub: "tessera-sub-1", email: "taken@example.com" }));

    const cookie = await buildTxCookieHeader();
    const res = await callOidcCallback({ cookie });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?error=tessera_email_conflict");
    expect(res.headers.get("set-cookie")).not.toContain("bland_refresh=");

    const userAStill = await getDb().select().from(users).where(eq(users.id, userA.id)).get();
    expect(userAStill?.email).toBe("old@example.com");
  });

  it("new sub matching unbound legacy user binds without creating workspace", async () => {
    const legacy = await seedUser({ email: "legacy@example.com" });
    await seedWorkspace({ owner_id: legacy.id, slug: "legacy-ws" });
    stubClaims(buildClaims({ sub: "tessera-sub-new", email: "legacy@example.com" }));

    const cookie = await buildTxCookieHeader();
    const res = await callOidcCallback({ cookie });

    expect(res.status).toBe(302);

    const identity = await getDb()
      .select()
      .from(tesseraIdentities)
      .where(eq(tesseraIdentities.sub, "tessera-sub-new"))
      .get();
    expect(identity?.user_id).toBe(legacy.id);

    const allWorkspaces = await getDb().select().from(workspaces).all();
    expect(allWorkspaces).toHaveLength(1);
  });

  it("new sub matching already-bound user fails closed", async () => {
    const bound = await seedUser({ email: "bound@example.com" });
    await seedTesseraIdentity({ sub: "tessera-sub-old", user_id: bound.id });
    stubClaims(buildClaims({ sub: "tessera-sub-new", email: "bound@example.com" }));

    const cookie = await buildTxCookieHeader();
    const res = await callOidcCallback({ cookie });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?error=identity_conflict");

    const conflicting = await getDb()
      .select()
      .from(tesseraIdentities)
      .where(eq(tesseraIdentities.sub, "tessera-sub-new"))
      .get();
    expect(conflicting).toBeUndefined();
  });

  it("new sub creates user + identity + workspace + owner membership", async () => {
    stubClaims(buildClaims({ sub: "tessera-sub-fresh", email: "fresh@example.com", name: "Fresh Person" }));

    const cookie = await buildTxCookieHeader();
    const res = await callOidcCallback({ cookie });

    expect(res.status).toBe(302);

    const newUser = await getDb().select().from(users).where(eq(users.email, "fresh@example.com")).get();
    expect(newUser).toBeTruthy();
    expect(newUser?.name).toBe("Fresh Person");

    const identity = await getDb()
      .select()
      .from(tesseraIdentities)
      .where(eq(tesseraIdentities.sub, "tessera-sub-fresh"))
      .get();
    expect(identity?.user_id).toBe(newUser?.id);

    const ws = await getDb().select().from(workspaces).where(eq(workspaces.owner_id, newUser!.id)).get();
    expect(ws).toBeTruthy();

    const member = await getDb().select().from(memberships).where(eq(memberships.user_id, newUser!.id)).get();
    expect(member?.role).toBe("owner");
  });

  it("email_verified=false redirects to oidc_unverified_email", async () => {
    stubClaims(buildClaims({ sub: "tessera-sub-1", email: "user@example.com", email_verified: false }));

    const cookie = await buildTxCookieHeader();
    const res = await callOidcCallback({ cookie });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?error=oidc_unverified_email");

    const userRows = await getDb().select().from(users).all();
    expect(userRows).toHaveLength(0);
  });

  it("missing tx cookie redirects to oidc_session_expired", async () => {
    stubClaims(buildClaims());
    const res = await callOidcCallback();

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?error=oidc_session_expired");
  });

  it("tampered tx cookie redirects to oidc_session_expired", async () => {
    stubClaims(buildClaims());
    const cookie = await buildTxCookieHeader();
    const tampered = cookie.slice(0, -4) + "XXXX";
    const res = await callOidcCallback({ cookie: tampered });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?error=oidc_session_expired");
  });

  it("state mismatch redirects to oidc_session_expired", async () => {
    stubClaims(buildClaims());
    const cookie = await buildTxCookieHeader();
    const res = await callOidcCallback({ cookie, state: "wrong-state" });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?error=oidc_session_expired");
  });

  it("token exchange failure redirects to oidc_provider_error", async () => {
    stubClaimsThrows("token endpoint unreachable");
    const cookie = await buildTxCookieHeader();
    const res = await callOidcCallback({ cookie });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?error=oidc_provider_error");
  });

  it("callback for the same sub with an existing session re-issues tokens", async () => {
    const user = await seedUser({ email: "user@example.com" });
    await seedTesseraIdentity({ sub: "tessera-sub-1", user_id: user.id });
    stubClaims(buildClaims({ sub: "tessera-sub-1", email: "user@example.com" }));

    const cookie = await buildTxCookieHeader({ returnTo: "/workspaces" });
    const res = await callOidcCallback({ cookie });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/workspaces");
    expect(res.headers.get("location")).toContain("oidc=1");
    expect(res.headers.get("set-cookie")).toContain("bland_refresh=");
  });

  it("callback for a different sub swaps the session server-side", async () => {
    const oldUser = await seedUser({ email: "old@example.com" });
    await seedTesseraIdentity({ sub: "tessera-sub-old", user_id: oldUser.id });
    const newUser = await seedUser({ email: "new@example.com" });
    await seedTesseraIdentity({ sub: "tessera-sub-new", user_id: newUser.id });
    stubClaims(buildClaims({ sub: "tessera-sub-new", email: "new@example.com" }));

    const cookie = await buildTxCookieHeader();
    const res = await callOidcCallback({ cookie });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("oidc=1");
    expect(res.headers.get("set-cookie")).toContain("bland_refresh=");
  });
});

describe("OIDC start", () => {
  beforeEach(async () => {
    await resetD1Tables();
    __test.setProviderForTesting(ISSUER, buildConfig());
  });

  afterEach(() => {
    __test.clear();
  });

  it("redirects to the authorization endpoint and sets the tx cookie", async () => {
    const res = await apiRequest("/api/v1/oidc/start", {
      method: "GET",
      origin: CALLBACK_ORIGIN,
      search: { return_to: "/workspaces" },
      redirect: "manual",
    });

    expect(res.status).toBe(302);
    const location = res.headers.get("location");
    expect(location).toBeTruthy();
    expect(location!.startsWith(`${ISSUER}/authorize`)).toBe(true);

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(OIDC_TX_COOKIE);
  });

  it("rejects requests from disallowed origins", async () => {
    const res = await apiRequest("/api/v1/oidc/start", {
      method: "GET",
      origin: "https://evil.example",
      headers: uniqueIpHeaders(),
      redirect: "manual",
    });

    expect(res.status).toBe(403);
  });
});
