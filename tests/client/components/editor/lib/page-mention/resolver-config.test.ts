import { describe, expect, it } from "vitest";
import {
  canUseCachedPageMentionData,
  getPageMentionEffectiveShareToken,
  getPageMentionResolverScopeKey,
} from "@/client/components/editor/lib/page-mention/resolver-config";
import type { ResolvedViewerContext } from "@/shared/types";

function createViewer(overrides: Partial<ResolvedViewerContext> = {}): ResolvedViewerContext {
  return {
    access_mode: "member",
    principal_type: "user",
    route_kind: "canonical",
    workspace_slug: "demo",
    ...overrides,
  };
}

describe("page mention resolver config", () => {
  it("only enables cached mention data for cache-backed canonical routes", () => {
    expect(canUseCachedPageMentionData(createViewer(), "cache")).toBe(true);
    expect(canUseCachedPageMentionData(createViewer(), "live")).toBe(false);
    expect(canUseCachedPageMentionData(createViewer({ route_kind: "shared", workspace_slug: null }), "cache")).toBe(
      false,
    );
  });

  it("changes resolver identity when viewer semantics change", () => {
    const before = getPageMentionResolverScopeKey(
      createViewer({ access_mode: "shared", principal_type: "link", route_kind: "shared", workspace_slug: null }),
      "share-token",
    );
    const after = getPageMentionResolverScopeKey(createViewer(), undefined);

    expect(before).not.toBe(after);
  });

  it("only folds the share token into identity for link principals", () => {
    expect(getPageMentionEffectiveShareToken(createViewer(), "share-token")).toBeNull();
    expect(
      getPageMentionEffectiveShareToken(
        createViewer({ access_mode: "shared", principal_type: "link", route_kind: "shared", workspace_slug: null }),
        "share-token",
      ),
    ).toBe("share-token");
  });

  it("does not encode route source into resolver identity", () => {
    const first = getPageMentionResolverScopeKey(createViewer(), undefined);
    const second = getPageMentionResolverScopeKey(createViewer(), undefined);

    expect(first).toBe(second);
  });
});
