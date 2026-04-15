import { createMiddleware } from "hono/factory";
import type { users } from "@/worker/db/d1/schema";
import { createLogger } from "@/worker/lib/logger";
import { CF_IP_HEADER } from "@/worker/lib/constants";
import { isLocalRequestUrl } from "@/worker/http";

const log = createLogger("rate-limit");

export function rateLimit(binding: "RL_AUTH" | "RL_API") {
  return createMiddleware<{
    Bindings: Env;
    Variables: {
      user: typeof users.$inferSelect | null;
    };
  }>(async (c, next) => {
    // Local dev and browser-driven E2E run through a single loopback IP and can
    // legitimately make bursts of auth/refresh calls during page bootstrap.
    // Keep production rate limits intact while avoiding flaky local lockouts.
    if (isLocalRequestUrl(c.req.url)) {
      await next();
      return;
    }

    const key =
      binding === "RL_AUTH"
        ? (c.req.header(CF_IP_HEADER) ?? "unknown")
        : (c.get("user")?.id ?? c.req.header(CF_IP_HEADER) ?? "unknown");

    const { success } = await c.env[binding].limit({ key });
    if (!success) {
      log.info("rate_limit_exceeded", { binding, key, path: c.req.path });
      return c.json({ error: "rate_limited", message: "Too many requests" }, 429);
    }

    await next();
  });
}
