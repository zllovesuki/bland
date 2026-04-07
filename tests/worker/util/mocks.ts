import { vi } from "vitest";
import type { Hono } from "hono";
import type { Db } from "@/worker/db/client";
import type { AppContext } from "@/worker/router";
import { TEST_TIMESTAMP } from "@tests/worker/util/fixtures";

const AUTH_USER: NonNullable<AppContext["Variables"]["user"]> = {
  id: "user-1",
  email: "user-1@example.com",
  password_hash: "password-hash",
  name: "Test User",
  avatar_url: null,
  created_at: TEST_TIMESTAMP,
  updated_at: TEST_TIMESTAMP,
};

const AUTH_JWT_PAYLOAD: NonNullable<AppContext["Variables"]["jwtPayload"]> = {
  sub: "user-1",
  jti: "jwt-1",
};

type TestContextSetter = {
  set: <K extends keyof AppContext["Variables"]>(key: K, value: AppContext["Variables"][K]) => void;
};

type TestBindings = { [K in keyof AppContext["Bindings"]]?: unknown };
type TestAllRow = Record<string, unknown>;
type TestAllQuery = (query: Parameters<Db["all"]>[0]) => ReturnType<Db["all"]>;

type TestSelectDb<TRow> = {
  select: () => {
    from: () => {
      where: () => {
        get: () => Promise<TRow>;
      };
    };
  };
};

type TestAllDb = {
  all: ReturnType<typeof vi.fn<TestAllQuery>>;
};

/**
 * No-op middleware mocks for requireAuth, optionalAuth, and rateLimit.
 * Call via vi.mock() at the top of test files that import route handlers.
 */
export function mockAuthMiddleware() {
  return {
    requireAuth: vi.fn(async (c: TestContextSetter, next: () => Promise<void>) => {
      c.set("user", AUTH_USER);
      c.set("jwtPayload", AUTH_JWT_PAYLOAD);
      await next();
    }),
    optionalAuth: vi.fn(async (c: TestContextSetter, next: () => Promise<void>) => {
      c.set("user", null);
      c.set("jwtPayload", null);
      await next();
    }),
  };
}

export function mockRateLimitMiddleware() {
  return {
    rateLimit: vi.fn(() => async (_c: object, next: () => Promise<void>) => next()),
  };
}

export function mockJose() {
  return {
    jwtVerify: vi.fn().mockResolvedValue({
      payload: { sub: "user-1", type: "refresh" },
    }),
  };
}

export function mockAuthHelpers() {
  return {
    parseCookies: vi.fn().mockReturnValue({ bland_refresh: "mock-token" }),
    REFRESH_COOKIE: "bland_refresh",
    getJwtSecret: vi.fn().mockReturnValue(new Uint8Array(32)),
  };
}

/** Creates a mock Drizzle select chain that resolves to the given row. */
export function createSelectMock<TRow>(row: TRow): TestSelectDb<TRow> {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue(row),
        }),
      }),
    }),
  };
}

/** Creates a mock Drizzle raw-query shape that resolves to the given rows. */
export function createAllMock<TRow extends TestAllRow>(rows: TRow[]): TestAllDb {
  const all = vi.fn<TestAllQuery>().mockImplementation(() => {
    return Promise.resolve(rows) as unknown as ReturnType<Db["all"]>;
  });
  return { all };
}

/**
 * Mounts a context-injection middleware + the given router on a fresh Hono app.
 * The middleware sets `db` and `env` on the Hono context.
 */
export async function createTestApp<TDb extends object = object, TEnv extends TestBindings = TestBindings>(
  router: Hono<AppContext>,
  routePrefix: string,
  opts: {
    db?: TDb;
    env?: TEnv;
  } = {},
) {
  const { Hono: H } = await import("hono");
  const app = new H<AppContext>();

  app.use("*", async (c, next) => {
    if (opts.db) c.set("db", opts.db as AppContext["Variables"]["db"]);
    if (opts.env) c.env = opts.env as AppContext["Bindings"];
    await next();
  });

  app.route(routePrefix, router);
  return app;
}
