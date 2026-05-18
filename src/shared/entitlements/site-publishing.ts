import { isWorkspaceAdminOrOwnerRole, type ResolvedWorkspaceRole } from "@/shared/entitlements/common";

export interface SitePublishingEntitlements {
  manageSite: boolean;
  // Read-only access to a single page's publish status. Owner/admin manage
  // publication; canonical non-guest members get this read so the ShareDialog
  // Publish tab can render a badge and public URL without exposing site
  // inventory or mutation paths.
  viewPagePublishStatus: boolean;
}

const ADMIN: SitePublishingEntitlements = {
  manageSite: true,
  viewPagePublishStatus: true,
};

const MEMBER: SitePublishingEntitlements = {
  manageSite: false,
  viewPagePublishStatus: true,
};

const DENY: SitePublishingEntitlements = {
  manageSite: false,
  viewPagePublishStatus: false,
};

export function getSitePublishingEntitlements(role: ResolvedWorkspaceRole): SitePublishingEntitlements {
  if (isWorkspaceAdminOrOwnerRole(role)) return ADMIN;
  if (role === "member") return MEMBER;
  return DENY;
}
