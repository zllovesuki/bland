import type { EntitlementSurface, PageAccessLevel } from "@/shared/entitlements/common";

export interface PageEditEntitlements {
  editDocument: boolean;
  editPageMetadata: boolean;
  insertPageMention: boolean;
  uploadImage: boolean;
}

const PAGE_EDIT_TABLE: Record<EntitlementSurface, Record<PageAccessLevel, PageEditEntitlements>> = {
  canonical: {
    none: {
      editDocument: false,
      editPageMetadata: false,
      insertPageMention: false,
      uploadImage: false,
    },
    view: {
      editDocument: false,
      editPageMetadata: false,
      insertPageMention: false,
      uploadImage: false,
    },
    edit: {
      editDocument: true,
      editPageMetadata: true,
      insertPageMention: true,
      uploadImage: true,
    },
  },
  shared: {
    none: {
      editDocument: false,
      editPageMetadata: false,
      insertPageMention: false,
      uploadImage: false,
    },
    view: {
      editDocument: false,
      editPageMetadata: false,
      insertPageMention: false,
      uploadImage: false,
    },
    edit: {
      editDocument: true,
      editPageMetadata: true,
      insertPageMention: false,
      uploadImage: true,
    },
  },
};

export function getPageEditEntitlements(
  surface: EntitlementSurface,
  pageAccess: PageAccessLevel,
): PageEditEntitlements {
  return PAGE_EDIT_TABLE[surface][pageAccess];
}
