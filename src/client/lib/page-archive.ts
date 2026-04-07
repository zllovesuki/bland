import { DEFAULT_PAGE_TITLE } from "@/shared/constants";

export function getArchivePageConfirmMessage(title: string | null | undefined, childCount: number): string {
  const pageTitle = title || DEFAULT_PAGE_TITLE;

  if (childCount === 1) {
    return `"${pageTitle}" will be moved to the archive. Its direct child page will be promoted to the workspace root.`;
  }

  if (childCount > 1) {
    return `"${pageTitle}" will be moved to the archive. Its ${childCount} direct child pages will be promoted to the workspace root.`;
  }

  return `"${pageTitle}" will be moved to the archive.`;
}
