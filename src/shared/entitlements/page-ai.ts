import {
  isWorkspaceWriterRole,
  type EntitlementSurface,
  type PageAccessLevel,
  type ResolvedWorkspaceRole,
} from "@/shared/entitlements/common";

export interface PageAiEntitlements {
  useAiRewrite: boolean;
  useAiGenerate: boolean;
  summarizePage: boolean;
  askPage: boolean;
}

const ALL_DENY: PageAiEntitlements = {
  useAiRewrite: false,
  useAiGenerate: false,
  summarizePage: false,
  askPage: false,
};

const CANONICAL_WRITER_TABLE: Record<PageAccessLevel, PageAiEntitlements> = {
  none: ALL_DENY,
  view: {
    useAiRewrite: false,
    useAiGenerate: false,
    summarizePage: true,
    askPage: true,
  },
  edit: {
    useAiRewrite: true,
    useAiGenerate: true,
    summarizePage: true,
    askPage: true,
  },
};

// AI is member-only by product policy. The role axis denies guests and
// non-members on the canonical surface even if they hold a page_share grant;
// the shared surface (`/s/:token` / `?share=`) is link-scoped and denies all
// AI regardless of role.
export function getPageAiEntitlements(
  surface: EntitlementSurface,
  pageAccess: PageAccessLevel,
  workspaceRole: ResolvedWorkspaceRole,
): PageAiEntitlements {
  if (surface === "shared") return ALL_DENY;
  if (!isWorkspaceWriterRole(workspaceRole)) return ALL_DENY;
  return CANONICAL_WRITER_TABLE[pageAccess];
}
