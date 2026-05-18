import { describe, expect, it } from "vitest";
import { deriveSitePublishAffordance } from "@/client/lib/affordance/site-publish";
import { getSitePublishingEntitlements } from "@/shared/entitlements";

const baseInput = {
  entitlements: getSitePublishingEntitlements("owner"),
  online: true,
  pageKind: "doc" as const,
};

describe("deriveSitePublishAffordance", () => {
  it("owners get the management action enabled when online", () => {
    const aff = deriveSitePublishAffordance(baseInput);
    expect(aff.showPublishTab).toBe(true);
    expect(aff.manageSite.kind).toBe("enabled");
  });

  it("members can view publish status but not manage anything", () => {
    const aff = deriveSitePublishAffordance({
      ...baseInput,
      entitlements: getSitePublishingEntitlements("member"),
    });
    expect(aff.showPublishTab).toBe(true);
    expect(aff.manageSite.kind).toBe("hidden");
  });

  it("guests and non-members do not see the Publish tab at all", () => {
    for (const role of ["guest", "none"] as const) {
      const aff = deriveSitePublishAffordance({
        ...baseInput,
        entitlements: getSitePublishingEntitlements(role),
      });
      expect(aff.showPublishTab).toBe(false);
      expect(aff.manageSite.kind).toBe("hidden");
    }
  });

  it("hides the Publish tab on canvas pages", () => {
    const aff = deriveSitePublishAffordance({ ...baseInput, pageKind: "canvas" });
    expect(aff.showPublishTab).toBe(false);
    expect(aff.manageSite.kind).toBe("enabled");
  });

  it("falls back to a disabled offline state when the user is offline", () => {
    const aff = deriveSitePublishAffordance({ ...baseInput, online: false });
    expect(aff.showPublishTab).toBe(true);
    expect(aff.manageSite.kind).toBe("disabled");
  });
});
