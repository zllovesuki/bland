import { getSchema, type JSONContent } from "@tiptap/core";
import { yXmlFragmentToProseMirrorRootNode } from "@tiptap/y-tiptap";
import * as Y from "yjs";

import { YJS_DOCUMENT_STORE } from "@/shared/constants";
import {
  collectEditorTextMetrics,
  createHeadlessEditorExtensions,
  type EditorTextMetrics,
} from "@/shared/editor/schema";

export interface ProjectedPageJson {
  content: JSONContent;
  metrics: EditorTextMetrics;
}

export async function projectPageJson(env: Pick<Env, "DocSync">, pageId: string): Promise<ProjectedPageJson | null> {
  const stub = env.DocSync.getByName(pageId);
  const snapshot = await stub.getSnapshotResponse(pageId);
  if (snapshot.kind === "missing") return createEmptyPageJson();

  const bytes = new Uint8Array(await snapshot.response.arrayBuffer());
  const ydoc = new Y.Doc();
  try {
    Y.applyUpdate(ydoc, bytes);
    const fragment = ydoc.getXmlFragment(YJS_DOCUMENT_STORE);
    const schema = getSchema(createHeadlessEditorExtensions());
    const root = yXmlFragmentToProseMirrorRootNode(fragment, schema);
    return {
      content: root.toJSON() as JSONContent,
      metrics: collectEditorTextMetrics(root),
    };
  } finally {
    ydoc.destroy();
  }
}

function createEmptyPageJson(): ProjectedPageJson {
  return {
    content: { type: "doc", content: [] },
    metrics: { words: 0, characters: 0 },
  };
}
