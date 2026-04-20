import { describe, expect, it } from "vitest";
import { deriveEditorAffordance } from "@/client/lib/affordance/editor";
import { deriveShareDialogAffordance, deriveShareDialogRowAffordance } from "@/client/lib/affordance/share-dialog";
import { deriveSharePageAffordance } from "@/client/lib/affordance/share-page";
import { deriveSidebarBaseAffordance, deriveSidebarRowAffordance } from "@/client/lib/affordance/sidebar";
import { deriveWorkspacePageAffordance } from "@/client/lib/affordance/workspace-page";

describe("client affordance models", () => {
  describe("editor affordance", () => {
    it("keeps canonical page mentions available offline when the document is editable", () => {
      expect(
        deriveEditorAffordance({
          surface: "canonical",
          pageAccess: "edit",
          workspaceId: "ws-1",
          online: false,
        }),
      ).toEqual({
        documentEditable: true,
        canInsertPageMentions: true,
        canInsertImages: false,
        canUseAiRewrite: false,
        canUseAiGenerate: false,
        canSummarizePage: false,
        canAskPage: false,
      });
    });

    it("enables all AI affordances for full members on canonical edit pages", () => {
      expect(
        deriveEditorAffordance({
          surface: "canonical",
          pageAccess: "edit",
          workspaceId: "ws-1",
          online: true,
          isFullMember: true,
        }),
      ).toMatchObject({
        canUseAiRewrite: true,
        canUseAiGenerate: true,
        canSummarizePage: true,
        canAskPage: true,
      });
    });

    it("disables page mentions in shared editors even when document editing is allowed", () => {
      expect(
        deriveEditorAffordance({
          surface: "shared",
          pageAccess: "edit",
          workspaceId: "ws-1",
          online: true,
        }),
      ).toEqual({
        documentEditable: true,
        canInsertPageMentions: false,
        canInsertImages: true,
        canUseAiRewrite: false,
        canUseAiGenerate: false,
        canSummarizePage: false,
        canAskPage: false,
      });
    });
  });

  describe("sidebar affordance", () => {
    it("hides guest create/move affordances but surfaces archive as ownership-restricted", () => {
      expect(deriveSidebarBaseAffordance({ workspaceRole: "guest", online: true })).toEqual({
        createPage: { kind: "hidden" },
      });
      expect(deriveSidebarRowAffordance({ workspaceRole: "guest", ownsPage: false, online: true })).toEqual({
        createSubpage: { kind: "hidden" },
        movePage: { kind: "hidden" },
        archivePage: { kind: "disabled", reason: "Only the page creator can archive this" },
      });
    });

    it("shows offline-disabled writer affordances and keeps archive blocked by ownership when the member does not own the page", () => {
      expect(deriveSidebarBaseAffordance({ workspaceRole: "member", online: false })).toEqual({
        createPage: { kind: "disabled", reason: "You're offline" },
      });
      expect(deriveSidebarRowAffordance({ workspaceRole: "member", ownsPage: false, online: false })).toEqual({
        createSubpage: { kind: "disabled", reason: "You're offline" },
        movePage: { kind: "disabled", reason: "You're offline" },
        archivePage: { kind: "disabled", reason: "Only the page creator can archive this" },
      });
    });

    it("surfaces the offline reason over enabled when the member owns the page", () => {
      expect(
        deriveSidebarRowAffordance({ workspaceRole: "member", ownsPage: true, online: false }).archivePage,
      ).toEqual({ kind: "disabled", reason: "You're offline" });
      expect(deriveSidebarRowAffordance({ workspaceRole: "member", ownsPage: true, online: true }).archivePage).toEqual(
        { kind: "enabled" },
      );
    });

    it("hides archive entirely for the none role so non-members see no archive affordance", () => {
      expect(deriveSidebarRowAffordance({ workspaceRole: "none", ownsPage: false, online: true }).archivePage).toEqual({
        kind: "hidden",
      });
    });
  });

  describe("workspace page affordance", () => {
    it("keeps canonical document editing available offline while disabling online-only actions", () => {
      expect(
        deriveWorkspacePageAffordance({
          accessMode: "member",
          workspaceRole: "member",
          pageAccess: "edit",
          ownsPage: false,
          workspaceId: "ws-1",
          online: false,
        }),
      ).toMatchObject({
        breadcrumbMode: "normal",
        shareDialog: { kind: "disabled", reason: "You're offline" },
        editPageMetadata: { kind: "disabled", reason: "You're offline" },
        archivePage: { kind: "disabled", reason: "Only the page creator can archive this" },
        editor: {
          documentEditable: true,
          canInsertPageMentions: true,
          canInsertImages: false,
        },
      });
    });

    it("uses restricted breadcrumbs for guest canonical page views", () => {
      expect(
        deriveWorkspacePageAffordance({
          accessMode: "member",
          workspaceRole: "guest",
          pageAccess: "view",
          ownsPage: false,
          workspaceId: "ws-1",
          online: true,
        }).breadcrumbMode,
      ).toBe("restricted");
    });
  });

  describe("share page affordance", () => {
    it("shows the view-only badge for view shares and allows uploads for editable shares", () => {
      expect(
        deriveSharePageAffordance({
          pageAccess: "view",
          workspaceId: "ws-1",
          online: true,
        }),
      ).toMatchObject({
        showViewOnlyBadge: true,
        editor: {
          documentEditable: false,
          canInsertPageMentions: false,
          canInsertImages: false,
        },
      });

      expect(
        deriveSharePageAffordance({
          pageAccess: "edit",
          workspaceId: "ws-1",
          online: true,
        }),
      ).toMatchObject({
        showViewOnlyBadge: false,
        editor: {
          documentEditable: true,
          canInsertPageMentions: false,
          canInsertImages: true,
        },
      });
    });
  });

  describe("share dialog affordance", () => {
    it("lets members create user shares but not link shares", () => {
      expect(
        deriveShareDialogAffordance({
          workspaceRole: "member",
          online: true,
          hasUserShares: false,
          hasLinkShares: false,
        }),
      ).toEqual({
        showPeopleSection: true,
        showLinkSection: false,
        createUserShare: { kind: "enabled" },
        createLinkShare: { kind: "hidden" },
      });
    });

    it("shows offline-disabled share actions while keeping populated sections visible", () => {
      expect(
        deriveShareDialogAffordance({
          workspaceRole: "admin",
          online: false,
          hasUserShares: true,
          hasLinkShares: true,
        }),
      ).toEqual({
        showPeopleSection: true,
        showLinkSection: true,
        createUserShare: { kind: "disabled", reason: "You're offline" },
        createLinkShare: { kind: "disabled", reason: "You're offline" },
      });
    });

    it("lets members revoke only qualifying user shares and keeps copy-link local for already-loaded link rows", () => {
      expect(
        deriveShareDialogRowAffordance({
          workspaceRole: "member",
          online: true,
          currentUserId: "user-1",
          share: {
            id: "share-1",
            page_id: "page-1",
            grantee_type: "user",
            grantee_id: "user-2",
            permission: "view",
            link_token: null,
            created_by: "user-1",
            created_at: "2026-01-01T00:00:00.000Z",
            grantee_user: null,
          },
          granteeIsWorkspaceMember: true,
        }),
      ).toEqual({
        revoke: { kind: "enabled" },
        copyLink: { kind: "hidden" },
      });

      expect(
        deriveShareDialogRowAffordance({
          workspaceRole: "member",
          online: false,
          currentUserId: "user-1",
          share: {
            id: "share-2",
            page_id: "page-1",
            grantee_type: "link",
            grantee_id: null,
            permission: "view",
            link_token: "token-1",
            created_by: "user-1",
            created_at: "2026-01-01T00:00:00.000Z",
            grantee_user: null,
          },
          granteeIsWorkspaceMember: false,
        }),
      ).toEqual({
        revoke: { kind: "hidden" },
        copyLink: { kind: "enabled" },
      });
    });
  });
});
