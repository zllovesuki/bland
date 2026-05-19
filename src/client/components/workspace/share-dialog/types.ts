import type { ShareDialogAffordance } from "@/client/lib/affordance/share-dialog";
import type { SitePublishAffordance } from "@/client/lib/affordance/site-publish";
import type { ResolvedWorkspaceRole } from "@/shared/entitlements";
import type { PageKind, PageShare, SitePageStatus, WorkspaceMember, WorkspaceSiteResponse } from "@/shared/types";

export type SharePermission = "view" | "edit";
export type WorkspaceRole = ResolvedWorkspaceRole;
export type DialogTab = "share" | "publish";

export interface ShareDialogProps {
  pageId: string;
  workspaceId: string;
  pageKind: PageKind;
  disabled?: boolean;
  title?: string;
}

export interface ShareDialogShellValue {
  disabled: boolean;
  title: string | undefined;
  open: boolean;
  loading: boolean;
  creating: boolean;
  error: string | null;
  dialogAffordance: ShareDialogAffordance;
  publishAffordance: SitePublishAffordance;
  workspaceRole: WorkspaceRole;
  online: boolean;
  currentUserId: string | undefined;
  activeTab: DialogTab;
  setActiveTab: (tab: DialogTab) => void;
  toggleOpen: () => void;
  close: () => void;
  deleteShare: (shareId: string) => Promise<void>;
}

export interface SharePeopleValue {
  peopleInput: string;
  peoplePermission: SharePermission;
  showSuggestions: boolean;
  userShares: PageShare[];
  members: WorkspaceMember[];
  filteredSuggestions: WorkspaceMember[];
  /** True when the input text exactly matches a shareable workspace member.
   *  Members (no canShareByEmail) cannot submit without this. */
  hasMatchedMember: boolean;
  memberName: (member: WorkspaceMember) => string;
  granteeName: (share: PageShare) => string;
  setPeopleInput: (value: string) => void;
  setPeoplePermission: (value: SharePermission) => void;
  openSuggestions: () => void;
  dismissSuggestions: () => void;
  selectMember: (member: WorkspaceMember) => void;
  submitPeopleShare: () => Promise<void>;
}

export interface ShareLinkValue {
  linkPermission: SharePermission;
  linkShares: PageShare[];
  copiedId: string | null;
  setLinkPermission: (value: SharePermission) => void;
  createLinkShare: () => Promise<void>;
  copyLink: (share: PageShare) => void;
}

export interface SitePublishValue {
  pageId: string;
  workspaceId: string;
  site: WorkspaceSiteResponse | undefined;
  pageStatus: SitePageStatus | undefined;
  loading: boolean;
  /** Any mutation in flight — used to disable peers while one is running. */
  saving: boolean;
  /** Per-action pending flags so each button can show its own spinner without
   *  the others spinning sympathetically. */
  slugSavePending: boolean;
  siteTogglePending: boolean;
  setHomePending: boolean;
  publishPending: boolean;
  unpublishPending: boolean;
  featureDisabled: boolean;
  error: string | null;
  slugDraft: string;
  setSlugDraft: (next: string) => void;
  saveSiteSlug: (slug: string) => Promise<void>;
  toggleSitePublished: () => Promise<void>;
  publishPage: () => Promise<void>;
  unpublishPage: () => Promise<void>;
  isHome: boolean;
  toggleHomePage: () => Promise<void>;
  copyPublicUrl: () => void;
  copied: boolean;
}

export interface ShareDialogSlices {
  shell: ShareDialogShellValue;
  people: SharePeopleValue;
  link: ShareLinkValue;
  publish: SitePublishValue;
}
