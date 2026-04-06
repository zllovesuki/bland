import { useState, useEffect } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { BlockNoteSchema, defaultBlockSpecs, createCodeBlockSpec } from "@blocknote/core";
import { createHighlighter } from "shiki";
import { Loader2 } from "lucide-react";
import * as Y from "yjs";
import { IndexeddbPersistence, storeState } from "y-indexeddb";
import { Awareness } from "y-protocols/awareness";
import "@blocknote/mantine/style.css";

interface EditorPaneProps {
  pageId: string;
  initialTitle: string;
  onTitleChange?: (title: string) => void;
}

const CODE_LANGUAGES: Record<string, { name: string; aliases?: string[] }> = {
  text: { name: "Plain Text", aliases: ["plaintext", "txt"] },
  javascript: { name: "JavaScript", aliases: ["js"] },
  typescript: { name: "TypeScript", aliases: ["ts"] },
  html: { name: "HTML" },
  css: { name: "CSS" },
  json: { name: "JSON" },
  sql: { name: "SQL" },
  python: { name: "Python", aliases: ["py"] },
  bash: { name: "Bash", aliases: ["sh", "shell"] },
  markdown: { name: "Markdown", aliases: ["md"] },
  go: { name: "Go" },
  rust: { name: "Rust", aliases: ["rs"] },
  yaml: { name: "YAML", aliases: ["yml"] },
};

const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock: createCodeBlockSpec({
      supportedLanguages: CODE_LANGUAGES,
      createHighlighter: () =>
        createHighlighter({
          themes: ["github-dark"],
          langs: Object.keys(CODE_LANGUAGES),
        }),
    }),
  },
});

function BlockEditor({
  fragment,
  provider,
  pageId,
}: {
  fragment: Y.XmlFragment;
  provider: { awareness: Awareness };
  pageId: string;
}) {
  const editor = useCreateBlockNote(
    {
      schema,
      collaboration: {
        provider,
        fragment,
        user: { name: "Local User", color: "#3b82f6" },
      },
    },
    [pageId],
  );

  return <BlockNoteView editor={editor} theme="dark" />;
}

export function EditorPane({ pageId, initialTitle, onTitleChange }: EditorPaneProps) {
  const [title, setTitle] = useState(initialTitle);
  const [editorState, setEditorState] = useState<{
    fragment: Y.XmlFragment;
    provider: { awareness: Awareness };
  } | null>(null);

  // TODO(docsync): Replace per-mount Y.Doc creation with a page-scoped doc
  // registry (acquire/release with delayed teardown) so both IDB persistence
  // and the future DO WebSocket provider attach to the same Y.Doc instance.
  useEffect(() => {
    const ydoc = new Y.Doc();
    const idb = new IndexeddbPersistence(`bland:doc:${pageId}`, ydoc);
    const awareness = new Awareness(ydoc);
    const fragment = ydoc.getXmlFragment("document-store");
    const provider = { awareness };
    let mounted = true;

    function handleSync() {
      if (mounted) {
        setEditorState({ fragment, provider });
        void storeState(idb);
      }
    }

    if (idb.synced) {
      handleSync();
    } else {
      idb.on("synced", handleSync);
    }

    return () => {
      mounted = false;
      idb.off("synced", handleSync);
      awareness.destroy();
      idb.destroy();
      ydoc.destroy();
    };
  }, [pageId]);

  function handleTitleChange(newTitle: string) {
    setTitle(newTitle);
    onTitleChange?.(newTitle);
  }

  return (
    <div>
      {/* Title input */}
      <textarea
        value={title}
        onChange={(e) => handleTitleChange(e.target.value)}
        placeholder="Untitled"
        rows={1}
        className="mb-4 w-full resize-none overflow-hidden border-none bg-transparent pl-7 text-4xl font-bold tracking-tight text-zinc-100 placeholder-zinc-600 outline-none"
        onInput={(e) => {
          const el = e.currentTarget;
          el.style.height = "auto";
          el.style.height = el.scrollHeight + "px";
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
          }
        }}
      />

      {/* BlockNote editor — only renders after IndexedDB has synced */}
      {editorState ? (
        <BlockEditor fragment={editorState.fragment} provider={editorState.provider} pageId={pageId} />
      ) : (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
        </div>
      )}
    </div>
  );
}
