import { memberships } from "@/worker/db/d1/schema";

export const TEST_TIMESTAMP = "2026-04-06T00:00:00.000Z";

export function createMembership(
  role: typeof memberships.$inferSelect.role = "member",
  overrides: Partial<typeof memberships.$inferSelect> = {},
): typeof memberships.$inferSelect {
  return {
    user_id: "user-1",
    workspace_id: "ws-1",
    role,
    joined_at: TEST_TIMESTAMP,
    ...overrides,
  };
}
