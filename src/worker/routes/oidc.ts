import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { ulid } from "ulid";
import * as oidc from "openid-client";
import type { Configuration, IDToken } from "openid-client";

import type { AppContext } from "@/worker/app-context";
import type { Db } from "@/worker/db/d1/client";
import { memberships, tesseraIdentities, users, workspaces } from "@/worker/db/d1/schema";
import { createRefreshToken, PASSWORD_DISABLED_SENTINEL, setRefreshCookie } from "@/worker/lib/auth";
import { rateLimit } from "@/worker/middleware/rate-limit";
import { isAllowedOrigin } from "@/worker/lib/origins";
import { createLogger } from "@/worker/lib/logger";
import {
  OIDC_SCOPE,
  OIDC_TX_COOKIE,
  OIDC_TX_COOKIE_MAX_AGE,
  appendOidcMarker,
  decodeTxCookie,
  encodeTxCookie,
  exchangeAuthorizationCode,
  getOidcConfig,
  oidcErrorContext,
  sanitizeReturnTo,
  validateClaims,
  type ResolvedClaims,
  type TxCookiePayload,
} from "@/worker/lib/oidc";

const log = createLogger("oidc");

const oidcRouter = new Hono<AppContext>();

const TX_COOKIE_OPTIONS = {
  path: "/" as const,
  httpOnly: true,
  secure: true,
  sameSite: "Lax" as const,
  maxAge: OIDC_TX_COOKIE_MAX_AGE,
};

const TX_COOKIE_CLEAR_OPTIONS = { path: "/" as const, secure: true };

function clearTxCookie(c: Context<AppContext>): void {
  deleteCookie(c, OIDC_TX_COOKIE, TX_COOKIE_CLEAR_OPTIONS);
}

function loginErrorRedirect(c: Context<AppContext>, code: string): Response {
  clearTxCookie(c);
  return c.redirect(`/login?error=${encodeURIComponent(code)}`, 302);
}

oidcRouter.get("/oidc/start", rateLimit("RL_AUTH"), async (c) => {
  const requestUrl = new URL(c.req.url);
  const origin = requestUrl.origin;
  if (!isAllowedOrigin(origin, c.env)) {
    return c.json({ error: "forbidden", message: "Origin not allowed" }, 403);
  }

  const returnTo = sanitizeReturnTo(c.req.query("return_to"));
  const redirectUri = `${origin}/api/v1/oidc/callback`;

  let config: Configuration;
  try {
    config = await getOidcConfig(c.env);
  } catch (err) {
    log.error("discovery_failed", oidcErrorContext(err, c.env));
    return c.redirect("/login?error=oidc_provider_error", 302);
  }

  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();

  const payload: TxCookiePayload = {
    state,
    nonce,
    codeVerifier,
    redirectUri,
    returnTo,
    createdAt: Date.now(),
  };

  const cookieValue = await encodeTxCookie(c.env, payload);
  setCookie(c, OIDC_TX_COOKIE, cookieValue, TX_COOKIE_OPTIONS);

  const authorizationUrl = oidc.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
    scope: OIDC_SCOPE,
  });

  log.info("oidc_start", { returnTo });
  return c.redirect(authorizationUrl.toString(), 302);
});

oidcRouter.get("/oidc/callback", rateLimit("RL_AUTH"), async (c) => {
  const requestUrl = new URL(c.req.url);
  const cookieValue = getCookie(c, OIDC_TX_COOKIE);
  const payload = await decodeTxCookie(c.env, cookieValue);
  if (!payload) {
    return loginErrorRedirect(c, "oidc_session_expired");
  }

  const queryState = c.req.query("state");
  if (!queryState || queryState !== payload.state) {
    return loginErrorRedirect(c, "oidc_session_expired");
  }

  const expectedRedirect = new URL(payload.redirectUri);
  if (expectedRedirect.host !== requestUrl.host) {
    return loginErrorRedirect(c, "oidc_session_expired");
  }

  let config: Configuration;
  try {
    config = await getOidcConfig(c.env);
  } catch (err) {
    log.error("discovery_failed", oidcErrorContext(err, c.env));
    return loginErrorRedirect(c, "oidc_provider_error");
  }

  let tokens: { claims(): IDToken | undefined };
  try {
    tokens = await exchangeAuthorizationCode(config, requestUrl, {
      pkceCodeVerifier: payload.codeVerifier,
      expectedNonce: payload.nonce,
      expectedState: payload.state,
    });
  } catch (err) {
    log.info("oidc_token_exchange_failed", oidcErrorContext(err, c.env));
    return loginErrorRedirect(c, "oidc_provider_error");
  }

  const claimsResult = validateClaims(tokens.claims());
  if (!claimsResult.ok) {
    return loginErrorRedirect(c, claimsResult.code);
  }

  const db = c.get("db");
  const outcome = await bindIdentity(db, claimsResult.claims);
  if (!outcome.ok) {
    return loginErrorRedirect(c, outcome.code);
  }

  // Browser JS cannot read response bodies/headers from a 302, so the access
  // token is materialized on the SPA's subsequent /auth/refresh call after
  // the oidc=1 marker forces a blocking refresh. Only the refresh cookie is
  // set here.
  const refreshToken = await createRefreshToken(outcome.userId, c.env);

  clearTxCookie(c);
  setRefreshCookie(c, refreshToken);

  log.info("oidc_callback_success", { userId: outcome.userId, outcome: outcome.kind });
  return c.redirect(appendOidcMarker(sanitizeReturnTo(payload.returnTo)), 302);
});

type BindOutcomeKind = "signed_in" | "email_updated" | "bound_legacy" | "created" | "raced_to_existing";

type BindOutcome =
  | { ok: true; kind: BindOutcomeKind; userId: string }
  | { ok: false; code: "tessera_email_conflict" | "identity_conflict" };

export async function bindIdentity(db: Db, claims: ResolvedClaims): Promise<BindOutcome> {
  const nowIso = new Date().toISOString();

  const existing = await db
    .select({ id: users.id, email: users.email })
    .from(tesseraIdentities)
    .innerJoin(users, eq(tesseraIdentities.user_id, users.id))
    .where(eq(tesseraIdentities.sub, claims.sub))
    .get();

  if (existing) {
    if (existing.email !== claims.email) {
      try {
        await db.update(users).set({ email: claims.email, updated_at: nowIso }).where(eq(users.id, existing.id));
      } catch (err) {
        if (isUniqueViolation(err)) {
          return { ok: false, code: "tessera_email_conflict" };
        }
        throw err;
      }
      await db.update(tesseraIdentities).set({ last_seen_at: nowIso }).where(eq(tesseraIdentities.sub, claims.sub));
      return { ok: true, kind: "email_updated", userId: existing.id };
    }
    await db.update(tesseraIdentities).set({ last_seen_at: nowIso }).where(eq(tesseraIdentities.sub, claims.sub));
    return { ok: true, kind: "signed_in", userId: existing.id };
  }

  const legacyByEmail = await db.select({ id: users.id }).from(users).where(eq(users.email, claims.email)).get();

  if (legacyByEmail) {
    const inserted = await db
      .insert(tesseraIdentities)
      .values({ sub: claims.sub, user_id: legacyByEmail.id, last_seen_at: nowIso })
      .onConflictDoNothing()
      .returning({ sub: tesseraIdentities.sub });
    if (inserted.length === 1) {
      return { ok: true, kind: "bound_legacy", userId: legacyByEmail.id };
    }
    const recheck = await findUserIdByTesseraSub(db, claims.sub);
    if (recheck && recheck === legacyByEmail.id) {
      return { ok: true, kind: "bound_legacy", userId: legacyByEmail.id };
    }
    return { ok: false, code: "identity_conflict" };
  }

  const userId = ulid();
  const workspaceId = ulid();
  const displayName = claims.name ?? friendlyNameFromEmail(claims.email);
  const workspaceName = `${displayName}'s workspace`;
  const workspaceSlug = defaultWorkspaceSlug(displayName, workspaceId);

  try {
    await db.batch([
      db.insert(users).values({
        id: userId,
        email: claims.email,
        password_hash: PASSWORD_DISABLED_SENTINEL,
        name: displayName,
      }),
      db.insert(tesseraIdentities).values({
        sub: claims.sub,
        user_id: userId,
        last_seen_at: nowIso,
      }),
      db.insert(workspaces).values({
        id: workspaceId,
        name: workspaceName,
        slug: workspaceSlug,
        owner_id: userId,
      }),
      db.insert(memberships).values({
        user_id: userId,
        workspace_id: workspaceId,
        role: "owner",
      }),
    ]);
    return { ok: true, kind: "created", userId };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const recheck = await findUserIdByTesseraSub(db, claims.sub);
    if (recheck) {
      return { ok: true, kind: "raced_to_existing", userId: recheck };
    }
    return { ok: false, code: "identity_conflict" };
  }
}

async function findUserIdByTesseraSub(db: Db, sub: string): Promise<string | null> {
  const row = await db
    .select({ user_id: tesseraIdentities.user_id })
    .from(tesseraIdentities)
    .where(eq(tesseraIdentities.sub, sub))
    .get();
  return row?.user_id ?? null;
}

function isUniqueViolation(err: unknown): boolean {
  // DrizzleQueryError wraps the underlying D1 error with a "Failed query: ..."
  // message and exposes the original on `.cause`. The SQLite text we need
  // ("UNIQUE constraint failed") lives there.
  const cause = err instanceof DrizzleQueryError ? err.cause : err;
  if (!(cause instanceof Error)) return false;
  return /UNIQUE|SQLITE_CONSTRAINT/i.test(cause.message);
}

function friendlyNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "user";
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "User";
  return cleaned
    .split(/\s+/)
    .map((part) => (part.length === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join(" ");
}

const SLUG_SUFFIX_LENGTH = 6;

function defaultWorkspaceSlug(name: string, workspaceId: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  const safeBase = base.length > 0 ? base : "workspace";
  const suffix = workspaceId.slice(-SLUG_SUFFIX_LENGTH).toLowerCase();
  return `${safeBase}-${suffix}`;
}

export { oidcRouter };
