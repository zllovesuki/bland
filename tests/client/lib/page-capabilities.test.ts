import { describe, expect, it } from "vitest";
import { createPage } from "@tests/client/util/fixtures";
import { derivePageCapabilities } from "@/client/lib/page-capabilities";
import type { WorkspaceAccessMode } from "@/client/stores/workspace-store";
import type { Page, WorkspaceRole } from "@/shared/types";

const USER_ID = "user-1";
const OTHER_USER_ID = "user-2";

function build({
  accessMode,
  role,
  online,
  shareToken,
  canEdit,
  createdBy,
}: {
  accessMode: WorkspaceAccessMode | null;
  role: WorkspaceRole | null;
  online: boolean;
  shareToken: string | null;
  canEdit?: boolean;
  createdBy?: string;
}): { page: Page & { can_edit?: boolean }; input: Parameters<typeof derivePageCapabilities>[0] } {
  const page: Page & { can_edit?: boolean } = {
    ...createPage({ created_by: createdBy ?? USER_ID }),
    can_edit: canEdit,
  };
  return {
    page,
    input: {
      page,
      accessMode,
      role,
      currentUserId: USER_ID,
      online,
      shareToken,
    },
  };
}

describe("derivePageCapabilities", () => {
  describe("canEdit", () => {
    it("is true when can_edit !== false and online", () => {
      const { input } = build({ accessMode: "member", role: "member", online: true, shareToken: null });
      expect(derivePageCapabilities(input).canEdit).toBe(true);
    });

    it("is false when can_edit is false", () => {
      const { input } = build({
        accessMode: "member",
        role: "member",
        online: true,
        shareToken: null,
        canEdit: false,
      });
      expect(derivePageCapabilities(input).canEdit).toBe(false);
    });

    it("is false when offline", () => {
      const { input } = build({ accessMode: "member", role: "member", online: false, shareToken: null });
      expect(derivePageCapabilities(input).canEdit).toBe(false);
    });

    it("treats undefined can_edit as true", () => {
      const { input } = build({ accessMode: "member", role: "member", online: true, shareToken: null });
      expect(derivePageCapabilities(input).canEdit).toBe(true);
    });
  });

  describe("workspace member with non-guest role", () => {
    it("grants create/share/drag/mention when online", () => {
      const caps = derivePageCapabilities(
        build({ accessMode: "member", role: "member", online: true, shareToken: null }).input,
      );
      expect(caps.canCreatePage).toBe(true);
      expect(caps.canShare).toBe(true);
      expect(caps.canDrag).toBe(true);
      expect(caps.canInsertMention).toBe(true);
    });

    it("keeps offline-tolerant capabilities (create, mention) but disables online-only (share, drag) when offline", () => {
      const caps = derivePageCapabilities(
        build({ accessMode: "member", role: "member", online: false, shareToken: null }).input,
      );
      expect(caps.canCreatePage).toBe(true);
      expect(caps.canInsertMention).toBe(true);
      expect(caps.canShare).toBe(false);
      expect(caps.canDrag).toBe(false);
    });
  });

  describe("guest role", () => {
    it("blocks create/share/mention regardless of online", () => {
      const caps = derivePageCapabilities(
        build({ accessMode: "member", role: "guest", online: true, shareToken: null }).input,
      );
      expect(caps.canCreatePage).toBe(false);
      expect(caps.canShare).toBe(false);
      expect(caps.canInsertMention).toBe(false);
    });
  });

  describe("shared workspace access mode", () => {
    it("blocks all workspace-level capabilities even with admin role", () => {
      const caps = derivePageCapabilities(
        build({ accessMode: "shared", role: "admin", online: true, shareToken: null }).input,
      );
      expect(caps.canCreatePage).toBe(false);
      expect(caps.canArchive).toBe(false);
      expect(caps.canShare).toBe(false);
      expect(caps.canDrag).toBe(false);
      expect(caps.canInsertMention).toBe(false);
    });
  });

  describe("share-link surface (shareToken set)", () => {
    it("blocks workspace-level capabilities even for member viewers", () => {
      const caps = derivePageCapabilities(
        build({ accessMode: "member", role: "owner", online: true, shareToken: "tok" }).input,
      );
      expect(caps.canCreatePage).toBe(false);
      expect(caps.canArchive).toBe(false);
      expect(caps.canShare).toBe(false);
      expect(caps.canDrag).toBe(false);
      expect(caps.canInsertMention).toBe(false);
    });

    it("preserves canEdit when can_edit is true (editable share link)", () => {
      const { input } = build({
        accessMode: "member",
        role: "owner",
        online: true,
        shareToken: "tok",
        canEdit: true,
      });
      expect(derivePageCapabilities(input).canEdit).toBe(true);
    });
  });

  describe("canArchive", () => {
    it("admin/owner can archive any page", () => {
      const caps = derivePageCapabilities(
        build({
          accessMode: "member",
          role: "admin",
          online: true,
          shareToken: null,
          createdBy: OTHER_USER_ID,
        }).input,
      );
      expect(caps.canArchive).toBe(true);
    });

    it("member role can archive own pages", () => {
      const caps = derivePageCapabilities(
        build({
          accessMode: "member",
          role: "member",
          online: true,
          shareToken: null,
          createdBy: USER_ID,
        }).input,
      );
      expect(caps.canArchive).toBe(true);
    });

    it("member role cannot archive others' pages", () => {
      const caps = derivePageCapabilities(
        build({
          accessMode: "member",
          role: "member",
          online: true,
          shareToken: null,
          createdBy: OTHER_USER_ID,
        }).input,
      );
      expect(caps.canArchive).toBe(false);
    });

    it("guest role can archive own pages (matches existing canArchivePage helper)", () => {
      const caps = derivePageCapabilities(
        build({
          accessMode: "member",
          role: "guest",
          online: true,
          shareToken: null,
          createdBy: USER_ID,
        }).input,
      );
      expect(caps.canArchive).toBe(true);
    });

    it("guest role cannot archive others' pages", () => {
      const caps = derivePageCapabilities(
        build({
          accessMode: "member",
          role: "guest",
          online: true,
          shareToken: null,
          createdBy: OTHER_USER_ID,
        }).input,
      );
      expect(caps.canArchive).toBe(false);
    });
  });
});
