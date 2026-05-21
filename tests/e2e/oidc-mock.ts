import { OIDCMockProvider, type OIDCMockProviderConfig } from "@mongodb-js/oidc-mock-provider";
import type { IncomingMessage, ServerResponse } from "node:http";

export const TEST_OIDC_CLIENT_ID = "bland-e2e";
export const TEST_OIDC_CLIENT_SECRET = "bland-e2e-tessera-secret";

export const E2E_BASELINE_TESSERA_SUB = "e2e-baseline-sub";
export const E2E_BASELINE_EMAIL = "e2e@bland.test";
export const E2E_BASELINE_NAME = "E2E Test User";

export interface MockIdentity {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
}

export interface MockOidcServer {
  issuer: string;
  close(): Promise<void>;
}

const BASELINE_IDENTITY: MockIdentity = {
  sub: E2E_BASELINE_TESSERA_SUB,
  email: E2E_BASELINE_EMAIL,
  email_verified: true,
  name: E2E_BASELINE_NAME,
};

// In-process slot consulted by `getTokenPayload`. Per-spec helpers POST
// `/__test/identity` to set the next identity, then trigger the OIDC flow.
// The slot is single-shot: it resets to the baseline after one consumption,
// keeping the default sign-in path safe for specs that don't override.
let nextIdentity: MockIdentity | null = null;

function selectIdentity(): MockIdentity {
  if (nextIdentity) {
    const id = nextIdentity;
    nextIdentity = null;
    return id;
  }
  return BASELINE_IDENTITY;
}

function handleControlRoute(url: string, req: IncomingMessage, res: ServerResponse): void {
  if (!url.includes("/__test/")) return;
  const parsed = new URL(url);
  if (parsed.pathname !== "/__test/identity") return;
  // The upstream mock provider forces application/x-www-form-urlencoded for
  // POST bodies before calling override handlers, so the control endpoint
  // accepts identity fields via query string instead.
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }
  const sub = parsed.searchParams.get("sub");
  const email = parsed.searchParams.get("email");
  const name = parsed.searchParams.get("name") ?? undefined;
  const emailVerified = parsed.searchParams.get("email_verified") !== "false";
  if (!sub || !email) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "invalid_body" }));
    return;
  }
  nextIdentity = { sub, email, email_verified: emailVerified, name };
  res.statusCode = 200;
  res.end(JSON.stringify({ ok: true }));
}

export async function startMockOidcProvider(options: { port?: number } = {}): Promise<MockOidcServer> {
  const config: OIDCMockProviderConfig = {
    port: options.port,
    hostname: "127.0.0.1",
    getTokenPayload: () => {
      const identity = selectIdentity();
      return {
        expires_in: 3600,
        payload: { sub: identity.sub, scope: "openid email profile" },
        customIdTokenPayload: {
          sub: identity.sub,
          email: identity.email,
          email_verified: identity.email_verified !== false,
          name: identity.name,
        },
      };
    },
    overrideRequestHandler: handleControlRoute,
  };
  const provider = await OIDCMockProvider.create(config);
  return {
    issuer: provider.issuer,
    close: () => provider.close(),
  };
}

export function resetMockIdentity(): void {
  nextIdentity = null;
}
