import { describe, expect, it } from "vitest";
import { canChangeMemberRole, canLeaveWorkspace, canRemoveMember } from "@/shared/entitlements";

describe("member management entitlements", () => {
  describe("canChangeMemberRole", () => {
    it("lets the owner promote to any role including admin", () => {
      expect(canChangeMemberRole("owner", "member", "admin")).toBe(true);
      expect(canChangeMemberRole("owner", "guest", "member")).toBe(true);
      expect(canChangeMemberRole("owner", "admin", "member")).toBe(true);
    });

    it("blocks admins from promoting anyone to admin", () => {
      expect(canChangeMemberRole("admin", "member", "admin")).toBe(false);
    });

    it("lets admins demote members and guests to non-admin roles", () => {
      expect(canChangeMemberRole("admin", "member", "guest")).toBe(true);
      expect(canChangeMemberRole("admin", "guest", "member")).toBe(true);
    });

    it("never allows owner role to be touched", () => {
      expect(canChangeMemberRole("owner", "owner", "admin")).toBe(false);
      expect(canChangeMemberRole("admin", "owner", "member")).toBe(false);
    });

    it("blocks members, guests, and non-members from changing roles", () => {
      expect(canChangeMemberRole("member", "guest", "member")).toBe(false);
      expect(canChangeMemberRole("guest", "member", "guest")).toBe(false);
      expect(canChangeMemberRole("none", "member", "guest")).toBe(false);
    });
  });

  describe("canRemoveMember", () => {
    it("lets anyone except the owner remove themselves", () => {
      expect(canRemoveMember("admin", "admin", true)).toBe(true);
      expect(canRemoveMember("member", "member", true)).toBe(true);
      expect(canRemoveMember("guest", "guest", true)).toBe(true);
      expect(canRemoveMember("owner", "owner", true)).toBe(false);
      expect(canRemoveMember("none", "none", true)).toBe(false);
    });

    it("lets the owner remove anyone except the owner", () => {
      expect(canRemoveMember("owner", "admin", false)).toBe(true);
      expect(canRemoveMember("owner", "member", false)).toBe(true);
      expect(canRemoveMember("owner", "guest", false)).toBe(true);
      expect(canRemoveMember("owner", "owner", false)).toBe(false);
    });

    it("blocks admins from removing other admins but allows removing members/guests", () => {
      expect(canRemoveMember("admin", "admin", false)).toBe(false);
      expect(canRemoveMember("admin", "member", false)).toBe(true);
      expect(canRemoveMember("admin", "guest", false)).toBe(true);
    });

    it("blocks members, guests, and non-members from removing others", () => {
      expect(canRemoveMember("member", "guest", false)).toBe(false);
      expect(canRemoveMember("guest", "member", false)).toBe(false);
      expect(canRemoveMember("none", "member", false)).toBe(false);
    });
  });

  describe("canLeaveWorkspace", () => {
    it("allows any non-owner member", () => {
      expect(canLeaveWorkspace("admin")).toBe(true);
      expect(canLeaveWorkspace("member")).toBe(true);
      expect(canLeaveWorkspace("guest")).toBe(true);
    });

    it("blocks the owner and non-members", () => {
      expect(canLeaveWorkspace("owner")).toBe(false);
      expect(canLeaveWorkspace("none")).toBe(false);
    });
  });
});
