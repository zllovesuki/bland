import { describe, expect, it } from "vitest";

import { accessFromCachedPage } from "@/client/lib/active-page-model";

describe("accessFromCachedPage", () => {
  it("returns view when the cached access mode is missing (fail closed)", () => {
    expect(accessFromCachedPage(null)).toEqual({ mode: "view" });
  });

  it("preserves view when the cached access mode is view", () => {
    expect(accessFromCachedPage("view")).toEqual({ mode: "view" });
  });

  it("preserves edit when the cached access mode is edit", () => {
    expect(accessFromCachedPage("edit")).toEqual({ mode: "edit" });
  });
});
