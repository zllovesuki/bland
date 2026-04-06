import { createMiddleware } from "hono/factory";
import type { users } from "@/worker/db/schema";

export function rateLimit(binding: "RL_AUTH" | "RL_API") {
  return createMiddleware<{
    Bindings: Env;
    Variables: {
      user: typeof users.$inferSelect | null;
    };
  }>(async (c, next) => {
    const key =
      binding === "RL_AUTH"
        ? (c.req.header("cf-connecting-ip") ?? "unknown")
        : (c.get("user")?.id ?? c.req.header("cf-connecting-ip") ?? "unknown");

    const { success } = await c.env[binding].limit({ key });
    if (!success) {
      return c.json({ error: "rate_limited", message: "Too many requests" }, 429);
    }

    await next();
  });
}
