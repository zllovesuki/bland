import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { GRADIENT_PRESETS } from "@/shared/page-cover";
import { publishedPages, workspaceSites, workspaces, memberships, pages } from "@/worker/db/d1/schema";
import { resetD1Tables, getDb } from "@tests/worker/helpers/db";
import { apiRequest } from "@tests/worker/helpers/request";
import { ApiErrorResponse } from "@tests/worker/helpers/schemas";
import { seedMembership, seedPage, seedUser, seedWorkspace } from "@tests/worker/helpers/seeds";
import type { SitePageStatus, WorkspaceSiteResponse } from "@/shared/types";
import { buildSitePagePath } from "@/worker/lib/site-public-url";
import { readSiteR2, writeSiteR2 } from "@/worker/sites/cache";
import { recordDocSyncPageSave } from "@/worker/lib/site-invalidation";

type MutableSitesEnv = { PUBLISHED_SITE_DOMAIN: string };

let siteBumpCounter = 0;

function expectedAcmePublicUrl(title: string, pageId: string): string {
  return `https://acme.sites.test${buildSitePagePath(pageId, title)}`;
}

async function setSiteUpdatedAt(workspaceId: string, updatedAt: string): Promise<void> {
  await getDb()
    .update(workspaceSites)
    .set({ updated_at: updatedAt })
    .where(eq(workspaceSites.workspace_id, workspaceId));
}

async function readSiteUpdatedAt(workspaceId: string): Promise<string> {
  const row = await getDb()
    .select({ updated_at: workspaceSites.updated_at })
    .from(workspaceSites)
    .where(eq(workspaceSites.workspace_id, workspaceId))
    .get();
  return row?.updated_at ?? "";
}

async function expectSiteBump(workspaceId: string, operation: () => Promise<Response>): Promise<Response> {
  siteBumpCounter += 1;
  const old = `2000-01-01T00:00:${siteBumpCounter.toString().padStart(2, "0")}.000Z`;
  await setSiteUpdatedAt(workspaceId, old);
  const response = await operation();
  expect(response.status).toBe(200);
  expect(await readSiteUpdatedAt(workspaceId)).not.toBe(old);
  return response;
}

describe("Sites management API", () => {
  beforeEach(async () => {
    await resetD1Tables();
  });

  describe("GET /workspaces/:wid/site", () => {
    it("returns null site for owner when no row exists", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });

      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site`, { userId: owner.id });
      expect(res.status).toBe(200);
      const body = (await res.json()) as WorkspaceSiteResponse;
      expect(body.site).toBeNull();
      expect(body.base_domain).toBe("sites.test");
    });

    it("returns 403 for members (manageSite false)", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });

      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site`, { userId: member.id });
      expect(res.status).toBe(403);
    });

    it("returns 403 for non-members", async () => {
      const owner = await seedUser();
      const stranger = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });

      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site`, { userId: stranger.id });
      expect(res.status).toBe(403);
    });

    it("returns sites_disabled when the feature is disabled", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      const originalDomain = env.PUBLISHED_SITE_DOMAIN;

      (env as MutableSitesEnv).PUBLISHED_SITE_DOMAIN = "";
      try {
        const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site`, { userId: owner.id });
        expect(res.status).toBe(404);
        const body = ApiErrorResponse.parse(await res.json());
        expect(body.error).toBe("sites_disabled");
      } finally {
        (env as MutableSitesEnv).PUBLISHED_SITE_DOMAIN = originalDomain;
      }
    });
  });

  describe("PATCH /workspaces/:wid/site", () => {
    it("lazy-creates a row on first PATCH with a slug", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });

      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site`, {
        method: "PATCH",
        body: { slug: "acme-co", published: true },
        userId: owner.id,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as WorkspaceSiteResponse;
      expect(body.site).toMatchObject({ workspace_id: ws.id, slug: "acme-co" });
      expect(body.site?.published_at).not.toBeNull();
    });

    it("rejects creation without a slug", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });

      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site`, {
        method: "PATCH",
        body: { published: true },
        userId: owner.id,
      });
      expect(res.status).toBe(400);
      const body = ApiErrorResponse.parse(await res.json());
      expect(body.error).toBe("bad_request");
    });

    it("returns 409 when slug collides with another workspace", async () => {
      const owner = await seedUser();
      const ws1 = await seedWorkspace({ owner_id: owner.id, slug: "ws-one" });
      const ws2 = await seedWorkspace({ owner_id: owner.id, slug: "ws-two" });

      const a = await apiRequest(`/api/v1/workspaces/${ws1.id}/site`, {
        method: "PATCH",
        body: { slug: "shared-slug", published: true },
        userId: owner.id,
      });
      expect(a.status).toBe(200);

      const b = await apiRequest(`/api/v1/workspaces/${ws2.id}/site`, {
        method: "PATCH",
        body: { slug: "shared-slug" },
        userId: owner.id,
      });
      expect(b.status).toBe(409);
    });

    it("rejects reserved slugs at the validator boundary", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });

      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site`, {
        method: "PATCH",
        body: { slug: "www" },
        userId: owner.id,
      });
      expect(res.status).toBe(400);
    });

    it("rejects empty-string and short home_page_id values at the schema layer", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });

      for (const home_page_id of ["", "shortid"]) {
        const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site`, {
          method: "PATCH",
          body: { slug: "acme", published: true, home_page_id },
          userId: owner.id,
        });
        expect(res.status).toBe(400);
      }
    });

    it("rejects setting a canvas page as home", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      const canvas = await seedPage({ workspace_id: ws.id, created_by: owner.id, kind: "canvas" });

      await apiRequest(`/api/v1/workspaces/${ws.id}/site`, {
        method: "PATCH",
        body: { slug: "acme", published: true },
        userId: owner.id,
      });

      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site`, {
        method: "PATCH",
        body: { home_page_id: canvas.id },
        userId: owner.id,
      });
      expect(res.status).toBe(400);
    });

    it("rejects setting an unpublished page as home", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });

      await apiRequest(`/api/v1/workspaces/${ws.id}/site`, {
        method: "PATCH",
        body: { slug: "acme", published: true },
        userId: owner.id,
      });

      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site`, {
        method: "PATCH",
        body: { home_page_id: page.id },
        userId: owner.id,
      });
      expect(res.status).toBe(400);
    });

    it("accepts a published page as home", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });

      await apiRequest(`/api/v1/workspaces/${ws.id}/site`, {
        method: "PATCH",
        body: { slug: "acme", published: true },
        userId: owner.id,
      });
      await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/${page.id}`, {
        method: "POST",
        userId: owner.id,
      });

      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site`, {
        method: "PATCH",
        body: { home_page_id: page.id },
        userId: owner.id,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as WorkspaceSiteResponse;
      expect(body.site?.home_page_id).toBe(page.id);
    });

    it("preserves published_at across enable->enable toggles", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });

      const first = await apiRequest(`/api/v1/workspaces/${ws.id}/site`, {
        method: "PATCH",
        body: { slug: "acme", published: true },
        userId: owner.id,
      });
      const firstBody = (await first.json()) as WorkspaceSiteResponse;
      const firstPublishedAt = firstBody.site?.published_at;

      const second = await apiRequest(`/api/v1/workspaces/${ws.id}/site`, {
        method: "PATCH",
        body: { published: true },
        userId: owner.id,
      });
      const secondBody = (await second.json()) as WorkspaceSiteResponse;
      expect(secondBody.site?.published_at).toBe(firstPublishedAt);
    });

    it("clears published_at when published: false", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });

      await apiRequest(`/api/v1/workspaces/${ws.id}/site`, {
        method: "PATCH",
        body: { slug: "acme", published: true },
        userId: owner.id,
      });
      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site`, {
        method: "PATCH",
        body: { published: false },
        userId: owner.id,
      });
      const body = (await res.json()) as WorkspaceSiteResponse;
      expect(body.site?.published_at).toBeNull();
    });

    it("denies members and non-members", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      const stranger = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });

      for (const u of [member, stranger]) {
        const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site`, {
          method: "PATCH",
          body: { slug: "acme", published: true },
          userId: u.id,
        });
        expect(res.status).toBe(403);
      }
    });
  });

  describe("GET /workspaces/:wid/site/slug-availability", () => {
    it("returns false for reserved labels", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });

      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site/slug-availability`, {
        userId: owner.id,
        search: { slug: "www" },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { available: boolean; reason?: string };
      expect(body.available).toBe(false);
    });

    it("returns false when slug is taken by another workspace", async () => {
      const owner = await seedUser();
      const ws1 = await seedWorkspace({ owner_id: owner.id, slug: "ws-one" });
      const ws2 = await seedWorkspace({ owner_id: owner.id, slug: "ws-two" });
      await apiRequest(`/api/v1/workspaces/${ws1.id}/site`, {
        method: "PATCH",
        body: { slug: "claimed", published: true },
        userId: owner.id,
      });

      const res = await apiRequest(`/api/v1/workspaces/${ws2.id}/site/slug-availability`, {
        userId: owner.id,
        search: { slug: "claimed" },
      });
      const body = (await res.json()) as { available: boolean };
      expect(body.available).toBe(false);
    });

    it("treats the same workspace's own slug as available", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      await apiRequest(`/api/v1/workspaces/${ws.id}/site`, {
        method: "PATCH",
        body: { slug: "mine", published: true },
        userId: owner.id,
      });

      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site/slug-availability`, {
        userId: owner.id,
        search: { slug: "mine" },
      });
      const body = (await res.json()) as { available: boolean };
      expect(body.available).toBe(true);
    });
  });

  describe("POST/DELETE /workspaces/:wid/site/pages/:id", () => {
    it("publishes a doc page and is idempotent", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });

      const first = await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/${page.id}`, {
        method: "POST",
        userId: owner.id,
      });
      expect(first.status).toBe(200);

      const second = await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/${page.id}`, {
        method: "POST",
        userId: owner.id,
      });
      expect(second.status).toBe(200);

      const rows = await getDb().select().from(publishedPages).where(eq(publishedPages.page_id, page.id));
      expect(rows).toHaveLength(1);
    });

    it("rejects publishing a canvas page", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      const canvas = await seedPage({ workspace_id: ws.id, created_by: owner.id, kind: "canvas" });

      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/${canvas.id}`, {
        method: "POST",
        userId: owner.id,
      });
      expect(res.status).toBe(400);
    });

    it("404s a missing page", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });

      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/01missing0000000000000000`, {
        method: "POST",
        userId: owner.id,
      });
      expect(res.status).toBe(404);
    });

    it("DELETE removes the explicit root", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
      await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/${page.id}`, {
        method: "POST",
        userId: owner.id,
      });
      const del = await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/${page.id}`, {
        method: "DELETE",
        userId: owner.id,
      });
      expect(del.status).toBe(200);

      const rows = await getDb().select().from(publishedPages).where(eq(publishedPages.page_id, page.id));
      expect(rows).toHaveLength(0);
    });

    it("DELETE leaves the page's private R2 projection artifact", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
      await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/${page.id}`, {
        method: "POST",
        userId: owner.id,
      });

      const updatedAt = "page-cache-v1";
      await writeSiteR2(env, ws.id, page.id, {
        content: { type: "doc", content: [] },
        metrics: { words: 0, characters: 0 },
        updatedAt,
      });
      expect(await readSiteR2(env, ws.id, page.id, updatedAt)).not.toBeNull();

      const del = await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/${page.id}`, {
        method: "DELETE",
        userId: owner.id,
      });
      expect(del.status).toBe(200);
      expect(await readSiteR2(env, ws.id, page.id, updatedAt)).not.toBeNull();
    });

    it("bumps the workspace site revision from route-owned public HTML mutations", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
      const parent = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Parent" });

      await apiRequest(`/api/v1/workspaces/${ws.id}/site`, {
        method: "PATCH",
        body: { slug: "acme", published: true },
        userId: owner.id,
      });

      await expectSiteBump(ws.id, () =>
        apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/${page.id}`, { method: "POST", userId: owner.id }),
      );

      await expectSiteBump(ws.id, () =>
        apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/${page.id}`, { method: "DELETE", userId: owner.id }),
      );

      await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/${page.id}`, { method: "POST", userId: owner.id });

      await expectSiteBump(ws.id, () =>
        apiRequest(`/api/v1/workspaces/${ws.id}/site`, {
          method: "PATCH",
          body: { home_page_id: page.id },
          userId: owner.id,
        }),
      );

      await expectSiteBump(ws.id, () =>
        apiRequest(`/api/v1/workspaces/${ws.id}`, {
          method: "PATCH",
          body: { name: "Renamed Workspace", icon: "R" },
          userId: owner.id,
        }),
      );

      await expectSiteBump(ws.id, () =>
        apiRequest(`/api/v1/workspaces/${ws.id}/pages/${page.id}`, {
          method: "PATCH",
          body: { icon: "P" },
          userId: owner.id,
        }),
      );

      await expectSiteBump(ws.id, () =>
        apiRequest(`/api/v1/workspaces/${ws.id}/pages/${page.id}`, {
          method: "PATCH",
          body: { cover_url: GRADIENT_PRESETS[0] },
          userId: owner.id,
        }),
      );

      await expectSiteBump(ws.id, () =>
        apiRequest(`/api/v1/workspaces/${ws.id}/pages/${page.id}`, {
          method: "PATCH",
          body: { parent_id: parent.id },
          userId: owner.id,
        }),
      );

      await expectSiteBump(ws.id, () =>
        apiRequest(`/api/v1/workspaces/${ws.id}/pages/${page.id}`, { method: "DELETE", userId: owner.id }),
      );
    });

    it("records DocSync saves while bumping the site revision only on title changes", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Old Title" });

      await apiRequest(`/api/v1/workspaces/${ws.id}/site`, {
        method: "PATCH",
        body: { slug: "acme", published: true },
        userId: owner.id,
      });

      await setSiteUpdatedAt(ws.id, "2000-01-01T00:00:00.000Z");
      const beforeUnchangedTitleSync = await getDb().select().from(pages).where(eq(pages.id, page.id)).get();

      await recordDocSyncPageSave(getDb(), page.id, "Old Title", "2026-05-17T01:00:00.000Z");
      expect(await readSiteUpdatedAt(ws.id)).toBe("2000-01-01T00:00:00.000Z");
      let stored = await getDb().select().from(pages).where(eq(pages.id, page.id)).get();
      expect(stored?.updated_at).not.toBe(beforeUnchangedTitleSync?.updated_at);
      expect(stored?.updated_at).toBe("2026-05-17T01:00:00.000Z");

      await recordDocSyncPageSave(getDb(), page.id, "New Title", "2026-05-17T01:01:00.000Z");
      expect(await readSiteUpdatedAt(ws.id)).toBe("2026-05-17T01:01:00.000Z");
      stored = await getDb().select().from(pages).where(eq(pages.id, page.id)).get();
      expect(stored?.title).toBe("New Title");
      expect(stored?.updated_at).toBe("2026-05-17T01:01:00.000Z");
    });

    it("does not touch a foreign workspace's page when DELETE is called with that page's id", async () => {
      // Defends the tenant boundary: a workspace-A admin must not be able to
      // bump pages.updated_at on a workspace-B page by supplying B's page id.
      const adminA = await seedUser();
      const ownerB = await seedUser();
      const wsA = await seedWorkspace({ owner_id: adminA.id, slug: "ws-a" });
      const wsB = await seedWorkspace({ owner_id: ownerB.id, slug: "ws-b" });
      const pageB = await seedPage({ workspace_id: wsB.id, created_by: ownerB.id });
      // Make pageB an explicit root in workspace B so we can detect any
      // accidental cross-workspace publish_pages delete too.
      await apiRequest(`/api/v1/workspaces/${wsB.id}/site/pages/${pageB.id}`, {
        method: "POST",
        userId: ownerB.id,
      });

      const beforePage = await getDb().select().from(pages).where(eq(pages.id, pageB.id)).get();
      const beforeRoots = await getDb().select().from(publishedPages).where(eq(publishedPages.workspace_id, wsB.id));

      const res = await apiRequest(`/api/v1/workspaces/${wsA.id}/site/pages/${pageB.id}`, {
        method: "DELETE",
        userId: adminA.id,
      });
      expect(res.status).toBe(200);

      const afterPage = await getDb().select().from(pages).where(eq(pages.id, pageB.id)).get();
      const afterRoots = await getDb().select().from(publishedPages).where(eq(publishedPages.workspace_id, wsB.id));
      expect(afterPage?.updated_at).toBe(beforePage?.updated_at);
      expect(afterRoots).toHaveLength(beforeRoots.length);
    });

    it("denies members", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
      const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });

      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/${page.id}`, {
        method: "POST",
        userId: member.id,
      });
      expect(res.status).toBe(403);
    });
  });

  describe("GET /workspaces/:wid/site/pages", () => {
    it("returns explicit roots for owners with title/icon metadata", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      const page = await seedPage({
        workspace_id: ws.id,
        created_by: owner.id,
        title: "Roots",
        icon: "R",
      });
      await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/${page.id}`, {
        method: "POST",
        userId: owner.id,
      });

      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages`, { userId: owner.id });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        published_roots: { page_id: string; title: string; icon: string | null; kind: "doc" }[];
      };
      expect(body.published_roots).toHaveLength(1);
      expect(body.published_roots[0]).toMatchObject({ page_id: page.id, title: "Roots", icon: "R" });
    });

    it("excludes archived roots", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
      await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/${page.id}`, {
        method: "POST",
        userId: owner.id,
      });
      await getDb().update(pages).set({ archived_at: new Date().toISOString() }).where(eq(pages.id, page.id));

      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages`, { userId: owner.id });
      const body = (await res.json()) as { published_roots: unknown[] };
      expect(body.published_roots).toHaveLength(0);
    });

    it("denies members", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });

      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages`, { userId: member.id });
      expect(res.status).toBe(403);
    });
  });

  describe("GET /workspaces/:wid/site/pages/:id/status", () => {
    it("returns direct-publish status with a public URL", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Hello World" });
      await apiRequest(`/api/v1/workspaces/${ws.id}/site`, {
        method: "PATCH",
        body: { slug: "acme", published: true },
        userId: owner.id,
      });
      await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/${page.id}`, {
        method: "POST",
        userId: owner.id,
      });

      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/${page.id}/status`, {
        userId: owner.id,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as SitePageStatus;
      expect(body.published).toBe(true);
      expect(body.is_explicit_root).toBe(true);
      expect(body.inherited_from).toBeNull();
      expect(body.public_url).toBe(expectedAcmePublicUrl("Hello World", page.id));
      expect(body.canvas).toBe(false);
    });

    it("returns inherited status for a child of an explicit root", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      const parent = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Parent", icon: "P" });
      const child = await seedPage({
        workspace_id: ws.id,
        created_by: owner.id,
        parent_id: parent.id,
        title: "Child",
      });
      await apiRequest(`/api/v1/workspaces/${ws.id}/site`, {
        method: "PATCH",
        body: { slug: "acme", published: true },
        userId: owner.id,
      });
      await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/${parent.id}`, {
        method: "POST",
        userId: owner.id,
      });

      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/${child.id}/status`, {
        userId: owner.id,
      });
      const body = (await res.json()) as SitePageStatus;
      expect(body.is_explicit_root).toBe(false);
      expect(body.inherited_from).toEqual({ id: parent.id, title: "Parent", icon: "P" });
      expect(body.published).toBe(true);
    });

    it("returns not-published for an isolated page", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });

      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/${page.id}/status`, {
        userId: owner.id,
      });
      const body = (await res.json()) as SitePageStatus;
      expect(body.published).toBe(false);
      expect(body.is_explicit_root).toBe(false);
      expect(body.inherited_from).toBeNull();
      expect(body.public_url).toBeNull();
    });

    it("marks canvas pages so the UI can hide publish controls", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      const canvas = await seedPage({ workspace_id: ws.id, created_by: owner.id, kind: "canvas" });

      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/${canvas.id}/status`, {
        userId: owner.id,
      });
      const body = (await res.json()) as SitePageStatus;
      expect(body.canvas).toBe(true);
    });

    it("treats an archived intermediate ancestor as breaking inheritance", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      const root = await seedPage({ workspace_id: ws.id, created_by: owner.id });
      const middle = await seedPage({ workspace_id: ws.id, created_by: owner.id, parent_id: root.id });
      const leaf = await seedPage({ workspace_id: ws.id, created_by: owner.id, parent_id: middle.id });
      await apiRequest(`/api/v1/workspaces/${ws.id}/site`, {
        method: "PATCH",
        body: { slug: "acme", published: true },
        userId: owner.id,
      });
      await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/${root.id}`, {
        method: "POST",
        userId: owner.id,
      });
      // Archive the middle ancestor. Inheritance must break at the gap.
      await getDb().update(pages).set({ archived_at: new Date().toISOString() }).where(eq(pages.id, middle.id));

      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/${leaf.id}/status`, {
        userId: owner.id,
      });
      const body = (await res.json()) as SitePageStatus;
      expect(body.published).toBe(false);
      expect(body.inherited_from).toBeNull();
    });

    it("allows canonical members to read status", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
      const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });

      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/${page.id}/status`, {
        userId: member.id,
      });
      expect(res.status).toBe(200);
    });

    it("exposes the public URL on the status response for a member viewing a published page", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
      const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Help Center" });

      await apiRequest(`/api/v1/workspaces/${ws.id}/site`, {
        method: "PATCH",
        body: { slug: "acme", published: true },
        userId: owner.id,
      });
      await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/${page.id}`, { method: "POST", userId: owner.id });

      // Confirms the member-accessible /status endpoint is enough on its own
      // to render the read-only Publish tab -- they never need to hit the
      // admin-only GET /site endpoint, and the public URL is built server-side.
      const adminOnly = await apiRequest(`/api/v1/workspaces/${ws.id}/site`, { userId: member.id });
      expect(adminOnly.status).toBe(403);

      const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/${page.id}/status`, { userId: member.id });
      expect(res.status).toBe(200);
      const body = (await res.json()) as SitePageStatus;
      expect(body.published).toBe(true);
      expect(body.is_explicit_root).toBe(true);
      expect(body.public_url).toBe(expectedAcmePublicUrl("Help Center", page.id));
    });

    it("denies guests and non-members", async () => {
      const owner = await seedUser();
      const guest = await seedUser();
      const stranger = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      await seedMembership({ user_id: guest.id, workspace_id: ws.id, role: "guest" });
      const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });

      for (const u of [guest, stranger]) {
        const res = await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/${page.id}/status`, {
          userId: u.id,
        });
        expect(res.status).toBe(403);
      }
    });
  });

  describe("workspace deletion cleans up site rows", () => {
    it("clears workspace_sites and published_pages alongside the workspace", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      const page = await seedPage({ workspace_id: ws.id, created_by: owner.id });
      await apiRequest(`/api/v1/workspaces/${ws.id}/site`, {
        method: "PATCH",
        body: { slug: "acme", published: true },
        userId: owner.id,
      });
      await apiRequest(`/api/v1/workspaces/${ws.id}/site/pages/${page.id}`, {
        method: "POST",
        userId: owner.id,
      });

      const del = await apiRequest(`/api/v1/workspaces/${ws.id}`, {
        method: "DELETE",
        userId: owner.id,
      });
      expect(del.status).toBe(200);

      const db = getDb();
      const remainingSite = await db.select().from(workspaceSites).where(eq(workspaceSites.workspace_id, ws.id));
      expect(remainingSite).toHaveLength(0);
      const remainingPublished = await db.select().from(publishedPages).where(eq(publishedPages.workspace_id, ws.id));
      expect(remainingPublished).toHaveLength(0);
      const remainingWs = await db.select().from(workspaces).where(eq(workspaces.id, ws.id));
      expect(remainingWs).toHaveLength(0);
      const remainingMemberships = await db.select().from(memberships).where(eq(memberships.workspace_id, ws.id));
      expect(remainingMemberships).toHaveLength(0);
    });
  });
});
