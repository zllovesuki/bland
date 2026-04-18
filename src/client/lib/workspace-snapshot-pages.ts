import type { Page } from "@/shared/types";

type SnapshotWithPages = {
  pages: Page[];
};

export function addSnapshotPage<T extends SnapshotWithPages>(snapshot: T, page: Page): T {
  return {
    ...snapshot,
    pages: [...snapshot.pages, page],
  };
}

export function upsertSnapshotPage<T extends SnapshotWithPages>(snapshot: T, page: Page): T {
  const index = snapshot.pages.findIndex((candidate) => candidate.id === page.id);
  if (index === -1) {
    return addSnapshotPage(snapshot, page);
  }

  return {
    ...snapshot,
    pages: snapshot.pages.map((candidate) => (candidate.id === page.id ? { ...candidate, ...page } : candidate)),
  };
}

export function patchSnapshotPage<T extends SnapshotWithPages>(snapshot: T, pageId: string, updates: Partial<Page>): T {
  return {
    ...snapshot,
    pages: snapshot.pages.map((page) => (page.id === pageId ? { ...page, ...updates } : page)),
  };
}

export function removeSnapshotPage<T extends SnapshotWithPages>(snapshot: T, pageId: string): T {
  return {
    ...snapshot,
    pages: snapshot.pages.filter((page) => page.id !== pageId),
  };
}

export function archiveSnapshotPage<T extends SnapshotWithPages>(snapshot: T, pageId: string): T {
  return {
    ...snapshot,
    pages: snapshot.pages
      .filter((page) => page.id !== pageId)
      .map((page) => (page.parent_id === pageId ? { ...page, parent_id: null } : page)),
  };
}
