import { createMiddleware } from "hono/factory";
import type { users } from "@/worker/db/d1/schema";
import { createLogger } from "@/worker/lib/logger";
import { CF_IP_HEADER } from "@/worker/lib/constants";

const log = createLogger("rate-limit");

export function rateLimit(binding: "RL_AUTH" | "RL_API") {
  return createMiddleware<{
    Bindings: Env;
    Variables: {
      user: typeof users.$inferSelect | null;
    };
  }>(async (c, next) => {
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
