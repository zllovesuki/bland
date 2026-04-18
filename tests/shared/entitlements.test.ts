import { describe, expect, it } from "vitest";
import {
  canCreateLinkShare,
  canCreateUserShare,
  canCreateUserShareByEmail,
  canRevealLinkTokens,
  canRevealShareGranteeEmails,
  canRevokeShare,
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
});
