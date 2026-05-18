import { describe, expect, it } from "vitest";

import { getSitePublishingEntitlements } from "@/shared/entitlements";

describe("getSitePublishingEntitlements", () => {
  it("grants every capability to owners and admins", () => {
    for (const role of ["owner", "admin"] as const) {
      const ents = getSitePublishingEntitlements(role);
      expect(ents).toEqual({
        manageSite: true,
        viewPagePublishStatus: true,
      });
    }
  });

  it("gives members read-only publish status only", () => {
    const ents = getSitePublishingEntitlements("member");
    expect(ents.viewPagePublishStatus).toBe(true);
    expect(ents.manageSite).toBe(false);
  });

  it("denies guests and non-members across the board", () => {
    for (const role of ["guest", "none"] as const) {
      const ents = getSitePublishingEntitlements(role);
      expect(Object.values(ents).some(Boolean)).toBe(false);
    }
  });
});
