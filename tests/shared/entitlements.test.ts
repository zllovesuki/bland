import { describe, expect, it } from "vitest";
import {
  canCreateLinkShare,
  canCreateUserShare,
  canCreateUserShareByEmail,
  canRevealLinkTokens,
  canRevealShareGranteeEmails,
  canRevokeShare,
  getPageAiEntitlements,
  getPageEditEntitlements,
  getPageStructureEntitlements,
} from "@/shared/entitlements";

describe("shared entitlements", () => {
  describe("page edit entitlements", () => {
    it("allows canonical edit surfaces to insert page mentions", () => {
      expect(getPageEditEntitlements("canonical", "edit")).toMatchObject({
        editDocument: true,
        editPageMetadata: true,
        insertPageMention: true,
        uploadImage: true,
      });
    });

    it("blocks page mention insertion on shared edit surfaces", () => {
      expect(getPageEditEntitlements("shared", "edit")).toMatchObject({
        editDocument: true,
        editPageMetadata: true,
        insertPageMention: false,
        uploadImage: true,
      });
    });
  });

  describe("page structure entitlements", () => {
    it("lets members create and move pages", () => {
      expect(getPageStructureEntitlements("member", false)).toMatchObject({
        createPage: true,
        movePage: true,
        archivePage: false,
      });
    });

    it("lets guests archive only their own pages", () => {
      expect(getPageStructureEntitlements("guest", true).archivePage).toBe(true);
      expect(getPageStructureEntitlements("guest", false)).toMatchObject({
        createPage: false,
        movePage: false,
        archivePage: false,
      });
    });

    it("exposes archive ownership scope so affordances can distinguish hidden from ownership-restricted", () => {
      expect(getPageStructureEntitlements("owner", false)).toMatchObject({
        archiveAnyPage: true,
        archiveOwnPage: true,
      });
      expect(getPageStructureEntitlements("member", false)).toMatchObject({
        archiveAnyPage: false,
        archiveOwnPage: true,
      });
      expect(getPageStructureEntitlements("none", false)).toMatchObject({
        archiveAnyPage: false,
        archiveOwnPage: false,
      });
    });
  });

  describe("share management entitlements", () => {
    it("lets members share only with workspace members", () => {
      expect(canCreateUserShare("member", true)).toBe(true);
      expect(canCreateUserShare("member", false)).toBe(false);
      expect(canCreateUserShareByEmail("member")).toBe(false);
    });

    it("reserves link-share creation and token visibility to admins/owners", () => {
      expect(canCreateLinkShare("admin")).toBe(true);
      expect(canCreateLinkShare("member")).toBe(false);
      expect(canRevealLinkTokens("owner")).toBe(true);
      expect(canRevealLinkTokens("member")).toBe(false);
    });

    it("lets members revoke only member user shares they created", () => {
      expect(
        canRevokeShare({
          workspaceRole: "member",
          granteeType: "user",
          shareCreatedByViewer: true,
          granteeIsWorkspaceMember: true,
        }),
      ).toBe(true);
      expect(
        canRevokeShare({
          workspaceRole: "member",
          granteeType: "link",
          shareCreatedByViewer: true,
          granteeIsWorkspaceMember: false,
        }),
      ).toBe(false);
      expect(
        canRevokeShare({
          workspaceRole: "member",
          granteeType: "user",
          shareCreatedByViewer: false,
          granteeIsWorkspaceMember: true,
        }),
      ).toBe(false);
    });

    it("keeps guest and non-member email visibility redacted", () => {
      expect(canRevealShareGranteeEmails("guest")).toBe(false);
      expect(canRevealShareGranteeEmails("none")).toBe(false);
      expect(canRevealShareGranteeEmails("member")).toBe(true);
    });
  });

  describe("page AI entitlements", () => {
    it("allows full members to rewrite, generate, summarize, and ask on edit pages", () => {
      expect(getPageAiEntitlements("canonical", "edit")).toEqual({
        useAiRewrite: true,
        useAiGenerate: true,
        summarizePage: true,
        askPage: true,
      });
    });

    it("restricts canonical view-only access to read-only AI actions", () => {
      expect(getPageAiEntitlements("canonical", "view")).toEqual({
        useAiRewrite: false,
        useAiGenerate: false,
        summarizePage: true,
        askPage: true,
      });
    });

    it("denies any AI action for canonical/none", () => {
      expect(getPageAiEntitlements("canonical", "none")).toEqual({
        useAiRewrite: false,
        useAiGenerate: false,
        summarizePage: false,
        askPage: false,
      });
    });

    it("denies all AI actions on the shared surface regardless of access level", () => {
      for (const access of ["none", "view", "edit"] as const) {
        expect(getPageAiEntitlements("shared", access)).toEqual({
          useAiRewrite: false,
          useAiGenerate: false,
          summarizePage: false,
          askPage: false,
        });
      }
    });
  });
});
