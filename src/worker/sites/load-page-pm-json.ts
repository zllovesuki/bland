import type { JSONContent } from "@tiptap/core";

import type { EditorTextMetrics } from "@/shared/editor/schema/metrics";
import type { ResolvedPublishedPage } from "@/worker/lib/published-pages";
import { readSiteR2, writeSiteR2 } from "@/worker/sites/cache";
import { projectPageJson } from "@/worker/sites/project-page-json";

type SiteTiming = <T>(name: string, operation: () => Promise<T>) => Promise<T>;

export interface LoadedPmJson {
  content: JSONContent;
  metrics: EditorTextMetrics;
  // Set when R2 was stale (or missing) and the freshly projected envelope
  // should be written back. Caller wraps it in ctx.waitUntil so the visitor
  // response is not delayed by the R2 PUT.
  writeBack: (() => Promise<void>) | null;
}

export interface LoadPagePmJsonArgs {
  env: Pick<Env, "SITES" | "DocSync">;
  page: ResolvedPublishedPage;
  timings?: SiteTiming;
}

export async function loadPagePmJson({ env, page, timings }: LoadPagePmJsonArgs): Promise<LoadedPmJson | null> {
  const r2 = await timeMaybe(timings, "r2_document", () =>
    readSiteR2(env, page.workspace_id, page.id, page.updated_at),
  );
  if (r2?.envelope && r2.fresh) {
    return { content: r2.envelope.content, metrics: r2.envelope.metrics, writeBack: null };
  }

  const projected = await timeMaybe(timings, "docsync_document", () => projectPageJson(env, page.id));
  if (!projected) return null;

  const envelope = {
    content: projected.content,
    metrics: projected.metrics,
    updatedAt: page.updated_at,
  };

  return {
    content: projected.content,
    metrics: projected.metrics,
    writeBack: () => writeSiteR2(env, page.workspace_id, page.id, envelope),
  };
}

function timeMaybe<T>(timings: SiteTiming | undefined, name: string, operation: () => Promise<T>): Promise<T> {
  return timings ? timings(name, operation) : operation();
}
