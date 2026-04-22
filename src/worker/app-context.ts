import { users } from "@/worker/db/d1/schema";
import type { Db } from "@/worker/db/d1/client";

type AppVariables = {
  db: Db;
  user: typeof users.$inferSelect | null;
  jwtPayload: { sub: string; jti: string } | null;
};

export type AppContext = { Bindings: Env; Variables: AppVariables };
