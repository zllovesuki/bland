import { describe, expect, it } from "vitest";

import { SITE_RESERVED_SLUGS, sitesSlug } from "@/shared/site-slug";

describe("sitesSlug validator", () => {
  it("accepts plain lowercase labels", () => {
    expect(sitesSlug.safeParse("acme").success).toBe(true);
    expect(sitesSlug.safeParse("acme-co").success).toBe(true);
    expect(sitesSlug.safeParse("a1b2c3").success).toBe(true);
  });

  it("rejects empty, too-long, or boundary-hyphen slugs", () => {
    expect(sitesSlug.safeParse("").success).toBe(false);
    expect(sitesSlug.safeParse("-leading").success).toBe(false);
    expect(sitesSlug.safeParse("trailing-").success).toBe(false);
    expect(sitesSlug.safeParse("a".repeat(64)).success).toBe(false);
  });

  it("rejects uppercase, underscores, dots, and non-ascii", () => {
    expect(sitesSlug.safeParse("Acme").success).toBe(false);
    expect(sitesSlug.safeParse("acme_co").success).toBe(false);
    expect(sitesSlug.safeParse("acme.co").success).toBe(false);
    expect(sitesSlug.safeParse("acme!").success).toBe(false);
  });

  it("rejects reserved labels", () => {
    for (const label of ["www", "api", "admin", "bland", "cdn-cgi"]) {
      expect(sitesSlug.safeParse(label).success).toBe(false);
    }
  });

  it("exposes the reserved set", () => {
    expect(SITE_RESERVED_SLUGS.has("www")).toBe(true);
    expect(SITE_RESERVED_SLUGS.has("bland")).toBe(true);
    expect(SITE_RESERVED_SLUGS.has("acme")).toBe(false);
  });
});
