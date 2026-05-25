import type { JSONContent } from "@tiptap/core";

import type { EditorTextMetrics } from "@/shared/editor/schema/metrics";
import type { ResolvedPublishedPage } from "@/worker/lib/published-pages";
import { readSiteR2 } from "@/worker/sites/cache";

type SiteTiming = <T>(name: string, operation: () => Promise<T>) => Promise<T>;

export interface LoadedPmJson {
  content: JSONContent;
  metrics: EditorTextMetrics;
  stale: boolean;
  artifactEtag: string;
  artifactUpdatedAt: string;
}

export interface LoadPagePmJsonArgs {
  env: Pick<Env, "SITES">;
  page: ResolvedPublishedPage;
  timings?: SiteTiming;
}

export async function loadPagePmJson({ env, page, timings }: LoadPagePmJsonArgs): Promise<LoadedPmJson | null> {
  const r2 = await timeMaybe(timings, "r2_document", () =>
    readSiteR2(env, page.workspace_id, page.id, page.updated_at),
  );
  if (!r2?.envelope) return null;
  return {
    content: r2.envelope.content,
    metrics: r2.envelope.metrics,
    stale: !r2.fresh,
    artifactEtag: r2.etag,
    artifactUpdatedAt: r2.envelope.updatedAt,
  };
}

function timeMaybe<T>(timings: SiteTiming | undefined, name: string, operation: () => Promise<T>): Promise<T> {
  return timings ? timings(name, operation) : operation();
}
