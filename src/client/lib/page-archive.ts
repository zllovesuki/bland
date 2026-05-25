import { DEFAULT_PAGE_TITLE } from "@/shared/constants";
import type { PageTreeIndex } from "@/client/lib/page-tree-model";

export function getActiveDescendantIds(index: Pick<PageTreeIndex, "childrenByParent">, pageId: string): string[] {
  const result: string[] = [];
  const stack = [...(index.childrenByParent.get(pageId) ?? [])].reverse();
  while (stack.length > 0) {
    const page = stack.pop()!;
    result.push(page.id);
    const children = index.childrenByParent.get(page.id);
    if (children) {
      for (let i = children.length - 1; i >= 0; i -= 1) {
        stack.push(children[i]);
      }
    }
  }
  return result;
}

export function getArchivePageConfirmMessage(title: string | null | undefined, descendantCount: number): string {
  const pageTitle = title || DEFAULT_PAGE_TITLE;

  if (descendantCount === 1) {
    return `"${pageTitle}" and 1 subpage will be archived.`;
  }

  if (descendantCount > 1) {
    return `"${pageTitle}" and ${descendantCount} subpages will be archived.`;
  }

  return `"${pageTitle}" will be archived.`;
}

export function shouldNavigateAwayAfterArchive(
  currentPageId: string | null | undefined,
  archivedPageIds: readonly string[],
): boolean {
  return !!currentPageId && archivedPageIds.includes(currentPageId);
}
