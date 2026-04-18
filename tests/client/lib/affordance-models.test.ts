import { describe, expect, it } from "vitest";
import { deriveEditorAffordance } from "@/client/lib/affordance/editor";
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
      });
    });
  });

  describe("sidebar affordance", () => {
    it("blocks guest create and drag affordances", () => {
      expect(deriveSidebarBaseAffordance({ workspaceRole: "guest", online: true })).toEqual({
        createPage: { kind: "hidden" },
        dragTree: { kind: "hidden" },
      });
      expect(deriveSidebarRowAffordance({ workspaceRole: "guest", ownsPage: false, online: true })).toEqual({
        createSubpage: { kind: "hidden" },
        archivePage: { kind: "hidden" },
        dragPage: { kind: "hidden" },
      });
    });

    it("shows offline-disabled writer affordances instead of hiding them", () => {
      expect(deriveSidebarBaseAffordance({ workspaceRole: "member", online: false })).toEqual({
        createPage: { kind: "disabled", reason: "You're offline" },
        dragTree: { kind: "disabled", reason: "You're offline" },
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
        archivePage: { kind: "hidden" },
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
});
