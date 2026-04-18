import type { ResolvedWorkspaceRole } from "@/shared/entitlements/common";

export interface PageStructureEntitlements {
  createPage: boolean;
  movePage: boolean;
  archivePage: boolean;
  archiveAnyPage: boolean;
  archiveOwnPage: boolean;
}

const PAGE_STRUCTURE_ROLE_TABLE: Record<
  ResolvedWorkspaceRole,
  { createPage: boolean; movePage: boolean; archiveOwnPage: boolean; archiveAnyPage: boolean }
> = {
  owner: {
    createPage: true,
    movePage: true,
    archiveOwnPage: true,
    archiveAnyPage: true,
  },
  admin: {
    createPage: true,
    movePage: true,
    archiveOwnPage: true,
    archiveAnyPage: true,
  },
  member: {
    createPage: true,
    movePage: true,
    archiveOwnPage: true,
    archiveAnyPage: false,
  },
  guest: {
    createPage: false,
    movePage: false,
    archiveOwnPage: true,
    archiveAnyPage: false,
  },
  none: {
    createPage: false,
    movePage: false,
    archiveOwnPage: false,
    archiveAnyPage: false,
  },
};

export function getPageStructureEntitlements(
  workspaceRole: ResolvedWorkspaceRole,
  ownsPage: boolean,
): PageStructureEntitlements {
  const roleEntitlements = PAGE_STRUCTURE_ROLE_TABLE[workspaceRole];

  return {
    createPage: roleEntitlements.createPage,
    movePage: roleEntitlements.movePage,
    archivePage: roleEntitlements.archiveAnyPage || (roleEntitlements.archiveOwnPage && ownsPage),
    archiveAnyPage: roleEntitlements.archiveAnyPage,
    archiveOwnPage: roleEntitlements.archiveOwnPage,
  };
}

export function canCreatePageInWorkspace(workspaceRole: ResolvedWorkspaceRole): boolean {
  return PAGE_STRUCTURE_ROLE_TABLE[workspaceRole].createPage;
}

export function canMovePagesInWorkspace(workspaceRole: ResolvedWorkspaceRole): boolean {
  return PAGE_STRUCTURE_ROLE_TABLE[workspaceRole].movePage;
}

export function canArchivePageInWorkspace(workspaceRole: ResolvedWorkspaceRole, ownsPage: boolean): boolean {
  return getPageStructureEntitlements(workspaceRole, ownsPage).archivePage;
}
