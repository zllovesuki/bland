import { describe, expect, it } from "vitest";
import { getSharedInboxReturnTo, withSharedInboxReturnTo } from "@/client/lib/shared-inbox-navigation";

describe("shared inbox navigation helpers", () => {
  it("reads a valid in-app return target from history state", () => {
    expect(getSharedInboxReturnTo({ blandSharedInboxReturnTo: "/workspace/page?x=1#hash" })).toBe(
      "/workspace/page?x=1#hash",
    );
  });

  it("rejects missing or unsafe return targets", () => {
    expect(getSharedInboxReturnTo(null)).toBeNull();
    expect(getSharedInboxReturnTo({ blandSharedInboxReturnTo: "https://example.com" })).toBeNull();
    expect(getSharedInboxReturnTo({ blandSharedInboxReturnTo: "workspace/page" })).toBeNull();
  });

  it("preserves existing router state when adding a return target", () => {
    expect(withSharedInboxReturnTo({ __TSR_index: 3, foo: "bar" }, "/shared")).toEqual({
      __TSR_index: 3,
      blandSharedInboxReturnTo: "/shared",
      foo: "bar",
    });
  });
});
