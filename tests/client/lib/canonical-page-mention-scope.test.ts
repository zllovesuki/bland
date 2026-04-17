import { describe, expect, it } from "vitest";
import {
  getCanonicalPageMentionViewer,
  lookupCanonicalCachedMentionPage,
} from "@/client/lib/canonical-page-mention-scope";
import { createPage, createWorkspace } from "@tests/client/util/fixtures";

const workspace = createWorkspace({ id: "ws-1", slug: "docs" });
const cachedPage = createPage({ id: "page-1", workspace_id: workspace.id });

describe("getCanonicalPageMentionViewer", () => {
  it("uses the canonical workspace and access mode when available", () => {
    expect(
      getCanonicalPageMentionViewer({
        accessMode: "member",
        workspaceSlug: workspace.slug,
        fallbackWorkspaceSlug: "stale-slug",
        cachedPage,
      }),
    ).toEqual({
      access_mode: "member",
      principal_type: "user",
      route_kind: "canonical",
      workspace_slug: "docs",
    });
  });

  it("builds a cache-backed canonical viewer for unresolved offline routes", () => {
    expect(
      getCanonicalPageMentionViewer({
        accessMode: null,
        workspaceSlug: null,
        fallbackWorkspaceSlug: "docs",
        cachedPage,
      }),
    ).toEqual({
      access_mode: "member",
      principal_type: "user",
      route_kind: "canonical",
      workspace_slug: "docs",
    });
  });

  it("preserves shared access mode when stale shared cache is all that remains", () => {
    expect(
      getCanonicalPageMentionViewer({
        accessMode: "shared",
        workspaceSlug: "docs",
        fallbackWorkspaceSlug: "docs",
        cachedPage,
      }),
    ).toEqual({
      access_mode: "shared",
      principal_type: "user",
      route_kind: "canonical",
      workspace_slug: "docs",
    });
  });

  it("returns null when there is neither canonical access mode nor cached page identity", () => {
    expect(
      getCanonicalPageMentionViewer({
        accessMode: null,
        workspaceSlug: null,
        fallbackWorkspaceSlug: "docs",
        cachedPage: null,
      }),
    ).toBeNull();
  });
});

describe("lookupCanonicalCachedMentionPage", () => {
  it("reads cached mention metadata from pageMetaById", () => {
    expect(
      lookupCanonicalCachedMentionPage(
        {
          "page-2": createPage({ id: "page-2", workspace_id: workspace.id, title: "Mention target", icon: "A" }),
        },
        workspace.id,
        "page-2",
      ),
    ).toEqual({ title: "Mention target", icon: "A" });
  });

  it("ignores pages from other workspaces and archived pages", () => {
    expect(
      lookupCanonicalCachedMentionPage(
        {
          "page-2": createPage({ id: "page-2", workspace_id: "ws-2", title: "Other workspace" }),
          "page-3": createPage({
            id: "page-3",
            workspace_id: workspace.id,
            title: "Archived",
            archived_at: new Date().toISOString(),
          }),
        },
        workspace.id,
        "page-2",
      ),
    ).toBeNull();
    expect(
      lookupCanonicalCachedMentionPage(
        {
          "page-2": createPage({ id: "page-2", workspace_id: "ws-2", title: "Other workspace" }),
          "page-3": createPage({
            id: "page-3",
            workspace_id: workspace.id,
            title: "Archived",
            archived_at: new Date().toISOString(),
          }),
        },
        workspace.id,
        "page-3",
      ),
    ).toBeNull();
  });
});
