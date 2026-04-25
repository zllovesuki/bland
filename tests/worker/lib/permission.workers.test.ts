import { beforeEach, describe, expect, it } from "vitest";

import {
  canAccessPage,
  canAccessPages,
  resolvePageAccessLevels,
  resolvePrincipal,
  toResolvedViewerContext,
} from "@/worker/lib/permissions";
import { getDb, resetD1Tables } from "@tests/worker/helpers/db";
import { TEST_TIMESTAMP } from "@tests/worker/helpers/fixtures";
import { seedMembership, seedPage, seedPageShare, seedUser, seedWorkspace } from "@tests/worker/helpers/seeds";

describe("worker permissions (real D1)", () => {
  beforeEach(async () => {
    await resetD1Tables();
  });

  describe("resolvePrincipal", () => {
    it("returns link principal on shared surface even when the user is a full member", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });

      const resolved = await resolvePrincipal(getDb(), { id: member.id }, ws.id, {
        surface: "shared",
        shareToken: "share-token",
      });

      expect(resolved).toEqual({
        principal: { type: "link", token: "share-token" },
        workspaceRole: null,
      });
    });

    it("returns user principal with writer role on canonical surface for members", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });

      const resolved = await resolvePrincipal(getDb(), { id: member.id }, ws.id, { surface: "canonical" });

      expect(resolved).toEqual({
        principal: { type: "user", userId: member.id },
        workspaceRole: "member",
      });
    });

    it("prefers share token for guests on canonical surface but still surfaces guest role", async () => {
      const owner = await seedUser();
      const guest = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      await seedMembership({ user_id: guest.id, workspace_id: ws.id, role: "guest" });

      const resolved = await resolvePrincipal(getDb(), { id: guest.id }, ws.id, {
        surface: "canonical",
        shareToken: "share-token",
      });

      expect(resolved).toEqual({
        principal: { type: "link", token: "share-token" },
        workspaceRole: "guest",
      });
    });

    it("returns user principal with guest role on canonical surface without share token", async () => {
      const owner = await seedUser();
      const guest = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      await seedMembership({ user_id: guest.id, workspace_id: ws.id, role: "guest" });

      const resolved = await resolvePrincipal(getDb(), { id: guest.id }, ws.id, { surface: "canonical" });

      expect(resolved).toEqual({
        principal: { type: "user", userId: guest.id },
        workspaceRole: "guest",
      });
    });

    it("returns null workspace role for an authenticated non-member on canonical surface", async () => {
      const owner = await seedUser();
      const outsider = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });

      const resolved = await resolvePrincipal(getDb(), { id: outsider.id }, ws.id, { surface: "canonical" });

      expect(resolved).toEqual({
        principal: { type: "user", userId: outsider.id },
        workspaceRole: null,
      });
    });

    it("returns anonymous link principal when no user is present on shared surface", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });

      const resolved = await resolvePrincipal(getDb(), null, ws.id, {
        surface: "shared",
        shareToken: "share-token",
      });

      expect(resolved).toEqual({
        principal: { type: "link", token: "share-token" },
        workspaceRole: null,
      });
    });

    it("returns null when no user and no share token", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });

      const resolved = await resolvePrincipal(getDb(), null, ws.id, { surface: "canonical" });

      expect(resolved).toBeNull();
    });
  });

  describe("toResolvedViewerContext", () => {
    it("marks shared surface as link-scoped with null workspace role even for member principals", () => {
      const viewer = toResolvedViewerContext(
        { principal: { type: "link", token: "tok" }, workspaceRole: "member" },
        "slug",
        "shared",
      );
      expect(viewer).toEqual({
        access_mode: "shared",
        principal_type: "link",
        route_kind: "shared",
        workspace_slug: null,
        workspace_role: null,
      });
    });

    it("serializes canonical viewer context with workspace slug and writer role", () => {
      const viewer = toResolvedViewerContext(
        { principal: { type: "user", userId: "u1" }, workspaceRole: "member" },
        "slug",
        "canonical",
      );
      expect(viewer).toEqual({
        access_mode: "member",
        principal_type: "user",
        route_kind: "canonical",
        workspace_slug: "slug",
        workspace_role: "member",
      });
    });

    it("serializes canonical guest as access_mode member with guest workspace role", () => {
      const viewer = toResolvedViewerContext(
        { principal: { type: "user", userId: "u1" }, workspaceRole: "guest" },
        "slug",
        "canonical",
      );
      expect(viewer).toEqual({
        access_mode: "member",
        principal_type: "user",
        route_kind: "canonical",
        workspace_slug: "slug",
        workspace_role: "guest",
      });
    });

    it("serializes canonical non-member as access_mode shared with null workspace role", () => {
      const viewer = toResolvedViewerContext(
        { principal: { type: "user", userId: "u1" }, workspaceRole: null },
        "slug",
        "canonical",
      );
      expect(viewer).toEqual({
        access_mode: "shared",
        principal_type: "user",
        route_kind: "canonical",
        workspace_slug: "slug",
        workspace_role: null,
      });
    });
  });

  describe("resolvePageAccessLevels + canAccessPage(s)", () => {
    it("short-circuits full workspace members to edit on every requested page", async () => {
      const owner = await seedUser();
      const member = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      await seedMembership({ user_id: member.id, workspace_id: ws.id, role: "member" });
      const pageA = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "A" });
      const pageB = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "B" });

      const levels = await resolvePageAccessLevels(
        getDb(),
        { type: "user", userId: member.id },
        [pageA.id, pageB.id],
        ws.id,
      );

      expect(levels).toEqual(
        new Map([
          [pageA.id, "edit"],
          [pageB.id, "edit"],
        ]),
      );
    });

    it("maps share grants to per-page access levels for guests and non-members", async () => {
      const owner = await seedUser();
      const guest = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      await seedMembership({ user_id: guest.id, workspace_id: ws.id, role: "guest" });
      const pageA = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "A" });
      const pageB = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "B" });
      const pageC = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "C" });
      await seedPageShare({
        page_id: pageA.id,
        created_by: owner.id,
        grantee_type: "user",
        grantee_id: guest.id,
        permission: "edit",
      });
      await seedPageShare({
        page_id: pageB.id,
        created_by: owner.id,
        grantee_type: "user",
        grantee_id: guest.id,
        permission: "view",
      });

      const levels = await resolvePageAccessLevels(
        getDb(),
        { type: "user", userId: guest.id },
        [pageA.id, pageB.id, pageC.id],
        ws.id,
      );

      expect(levels).toEqual(
        new Map([
          [pageA.id, "edit"],
          [pageB.id, "view"],
          [pageC.id, "none"],
        ]),
      );
    });

    it("converts resolved levels into booleans for batch view and edit checks", async () => {
      const owner = await seedUser();
      const outsider = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      const pageEdit = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "EditPage" });
      const pageView = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "ViewPage" });
      const pageNone = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "NonePage" });
      await seedPageShare({
        page_id: pageEdit.id,
        created_by: owner.id,
        grantee_type: "user",
        grantee_id: outsider.id,
        permission: "edit",
      });
      await seedPageShare({
        page_id: pageView.id,
        created_by: owner.id,
        grantee_type: "user",
        grantee_id: outsider.id,
        permission: "view",
      });

      const viewResults = await canAccessPages(
        getDb(),
        { type: "user", userId: outsider.id },
        [pageEdit.id, pageView.id, pageNone.id],
        ws.id,
        "view",
      );
      const editResults = await canAccessPages(
        getDb(),
        { type: "user", userId: outsider.id },
        [pageEdit.id, pageView.id, pageNone.id],
        ws.id,
        "edit",
      );

      expect(viewResults).toEqual(
        new Map([
          [pageEdit.id, true],
          [pageView.id, true],
          [pageNone.id, false],
        ]),
      );
      expect(editResults).toEqual(
        new Map([
          [pageEdit.id, true],
          [pageView.id, false],
          [pageNone.id, false],
        ]),
      );
    });

    it("uses the same resolver path for single-page checks", async () => {
      const owner = await seedUser();
      const outsider = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Single" });
      await seedPageShare({
        page_id: page.id,
        created_by: owner.id,
        grantee_type: "user",
        grantee_id: outsider.id,
        permission: "view",
      });

      await expect(canAccessPage(getDb(), { type: "user", userId: outsider.id }, page.id, ws.id, "view")).resolves.toBe(
        true,
      );
      await expect(canAccessPage(getDb(), { type: "user", userId: outsider.id }, page.id, ws.id, "edit")).resolves.toBe(
        false,
      );
    });

    it("skips membership checks for link principals and resolves access from shares only", async () => {
      const owner = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      const page = await seedPage({ workspace_id: ws.id, created_by: owner.id, title: "Link" });
      await seedPageShare({
        page_id: page.id,
        created_by: owner.id,
        grantee_type: "link",
        grantee_id: null,
        link_token: "link-principal-tok",
        permission: "edit",
      });

      const levels = await resolvePageAccessLevels(
        getDb(),
        { type: "link", token: "link-principal-tok" },
        [page.id],
        ws.id,
      );

      expect(levels).toEqual(new Map([[page.id, "edit"]]));
    });
  });

  describe("archived ancestor inheritance", () => {
    it("blocks share inheritance through an archived ancestor", async () => {
      const owner = await seedUser();
      const grantee = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      const parent = await seedPage({
        workspace_id: ws.id,
        created_by: owner.id,
        title: "Archived Parent",
        archived_at: TEST_TIMESTAMP,
      });
      const child = await seedPage({
        workspace_id: ws.id,
        created_by: owner.id,
        parent_id: parent.id,
        title: "Live Child",
      });
      await seedPageShare({
        page_id: parent.id,
        created_by: owner.id,
        grantee_type: "user",
        grantee_id: grantee.id,
        permission: "edit",
      });

      const levels = await resolvePageAccessLevels(getDb(), { type: "user", userId: grantee.id }, [child.id], ws.id);

      expect(levels).toEqual(new Map([[child.id, "none"]]));
      expect(await canAccessPage(getDb(), { type: "user", userId: grantee.id }, child.id, ws.id, "view")).toBe(false);
    });

    it("preserves a direct share on the descendant when an ancestor is archived", async () => {
      const owner = await seedUser();
      const grantee = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      const parent = await seedPage({
        workspace_id: ws.id,
        created_by: owner.id,
        title: "Archived Parent",
        archived_at: TEST_TIMESTAMP,
      });
      const child = await seedPage({
        workspace_id: ws.id,
        created_by: owner.id,
        parent_id: parent.id,
        title: "Live Child",
      });
      await seedPageShare({
        page_id: child.id,
        created_by: owner.id,
        grantee_type: "user",
        grantee_id: grantee.id,
        permission: "view",
      });

      const levels = await resolvePageAccessLevels(getDb(), { type: "user", userId: grantee.id }, [child.id], ws.id);

      expect(levels).toEqual(new Map([[child.id, "view"]]));
    });

    it("returns none when the target page itself is archived even with a direct share", async () => {
      const owner = await seedUser();
      const grantee = await seedUser();
      const ws = await seedWorkspace({ owner_id: owner.id });
      const page = await seedPage({
        workspace_id: ws.id,
        created_by: owner.id,
        title: "Archived Page",
        archived_at: TEST_TIMESTAMP,
      });
      await seedPageShare({
        page_id: page.id,
        created_by: owner.id,
        grantee_type: "user",
        grantee_id: grantee.id,
        permission: "edit",
      });

      const levels = await resolvePageAccessLevels(getDb(), { type: "user", userId: grantee.id }, [page.id], ws.id);

      expect(levels).toEqual(new Map([[page.id, "none"]]));
    });
  });
});
