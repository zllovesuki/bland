import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { PASSWORD_DISABLED_SENTINEL } from "@/worker/lib/auth";
import { tesseraIdentities, users } from "@/worker/db/d1/schema";
import { getDb, resetD1Tables } from "@tests/worker/helpers/db";
import { seedTesseraIdentity, seedUser } from "@tests/worker/helpers/seeds";

describe("tessera_identities schema", () => {
  beforeEach(async () => {
    await resetD1Tables();
  });

  it("rejects two rows with the same sub", async () => {
    const a = await seedUser({ email: "a@example.com" });
    const b = await seedUser({ email: "b@example.com" });
    await seedTesseraIdentity({ sub: "shared-sub", user_id: a.id });

    await expect(seedTesseraIdentity({ sub: "shared-sub", user_id: b.id })).rejects.toThrow();
  });

  it("rejects two identity rows for the same user_id", async () => {
    const user = await seedUser({ email: "single@example.com" });
    await seedTesseraIdentity({ sub: "sub-1", user_id: user.id });

    await expect(seedTesseraIdentity({ sub: "sub-2", user_id: user.id })).rejects.toThrow();
  });

  it("accepts a user with the disabled-password sentinel", async () => {
    const db = getDb();
    await db.insert(users).values({
      id: "sentinel-user",
      email: "sentinel@example.com",
      password_hash: PASSWORD_DISABLED_SENTINEL,
      name: "Sentinel User",
    });
    const stored = await db.select().from(users).where(eq(users.id, "sentinel-user")).get();
    expect(stored?.password_hash).toBe(PASSWORD_DISABLED_SENTINEL);
  });

  it("loads legacy users without an identity row", async () => {
    const legacy = await seedUser({ email: "legacy@example.com" });
    const identity = await getDb()
      .select()
      .from(tesseraIdentities)
      .where(eq(tesseraIdentities.user_id, legacy.id))
      .get();
    expect(identity).toBeUndefined();
    const stored = await getDb().select().from(users).where(eq(users.id, legacy.id)).get();
    expect(stored?.email).toBe("legacy@example.com");
  });

  it("cascades identity rows when the user is deleted", async () => {
    const user = await seedUser({ email: "cascade@example.com" });
    await seedTesseraIdentity({ sub: "cascade-sub", user_id: user.id });

    await getDb().delete(users).where(eq(users.id, user.id));

    const remaining = await getDb()
      .select()
      .from(tesseraIdentities)
      .where(eq(tesseraIdentities.sub, "cascade-sub"))
      .get();
    expect(remaining).toBeUndefined();
  });
});
