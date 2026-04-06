import { useState, useEffect, useCallback, useRef } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { BlockNoteSchema, defaultBlockSpecs, createCodeBlockSpec } from "@blocknote/core";
import { createHighlighter } from "shiki";
import { Loader2 } from "lucide-react";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import YProvider from "y-partyserver/provider";
import type { Awareness } from "y-protocols/awareness";
import { useAuthStore } from "@/client/stores/auth-store";
import { userColor } from "@/client/hooks/use-sync";
import "@blocknote/mantine/style.css";

interface EditorPaneProps {
  pageId: string;
  initialTitle: string;
  onTitleChange?: (title: string) => void;
  onProvider?: (provider: YProvider | null) => void;
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
  const user = useAuthStore((s) => s.user);
  const editor = useCreateBlockNote(
    {
      schema,
      collaboration: {
        provider,
        fragment,
        user: {
          name: user?.name ?? "Anonymous",
          color: userColor(user?.id ?? "anon"),
        },
      },
    },
    [pageId],
  );

  return <BlockNoteView editor={editor} theme="dark" />;
}

export function EditorPane({ pageId, initialTitle, onTitleChange, onProvider }: EditorPaneProps) {
  const [title, setTitle] = useState(initialTitle);
  const [editorState, setEditorState] = useState<{
    fragment: Y.XmlFragment;
    provider: { awareness: Awareness };
    ydoc: Y.Doc;
  } | null>(null);

  // Refs for values used in the effect but that shouldn't trigger re-setup
  const initialTitleRef = useRef(initialTitle);
  initialTitleRef.current = initialTitle;
  const onTitleChangeRef = useRef(onTitleChange);
  onTitleChangeRef.current = onTitleChange;
  const onProviderRef = useRef(onProvider);
  onProviderRef.current = onProvider;

  useEffect(() => {
    const ydoc = new Y.Doc();
    const idb = new IndexeddbPersistence(`bland:doc:${pageId}`, ydoc);
    const fragment = ydoc.getXmlFragment("document-store");
    const titleText = ydoc.getText("page-title");
    let wsProvider: YProvider | null = null;
    let seedTitleTimeout: ReturnType<typeof window.setTimeout> | null = null;
    let mounted = true;
    let seededTitle = false;

    // Observe collaborative title changes from remote peers
    const titleObserver = () => {
      if (!mounted) return;
      const t = titleText.toString();
      setTitle(t);
      onTitleChangeRef.current?.(t);
    };
    titleText.observe(titleObserver);

    const maybeSeedTitle = () => {
      if (!mounted || seededTitle) return;
      seededTitle = true;
      if (seedTitleTimeout !== null) {
        window.clearTimeout(seedTitleTimeout);
        seedTitleTimeout = null;
      }

      const seed = initialTitleRef.current;
      if (titleText.length === 0 && seed) {
        titleText.insert(0, seed);
      }
    };

    const handleProviderSync = (isSynced: boolean) => {
      if (!isSynced) return;
      maybeSeedTitle();
    };

    function handleSync() {
      if (!mounted) return;

      if (titleText.length > 0) {
        setTitle(titleText.toString());
        onTitleChangeRef.current?.(titleText.toString());
      }

      // Connect WebSocket to DocSync DO — always create provider so
      // reconnect picks up a fresh token via the params function
      const hasToken = !!useAuthStore.getState().accessToken;
      wsProvider = new YProvider(window.location.host, pageId, ydoc, {
        party: "doc-sync",
        connect: hasToken,
        params: () => ({
          token: useAuthStore.getState().accessToken || "",
        }),
      });
      wsProvider.on("sync", handleProviderSync);
      seedTitleTimeout = window.setTimeout(() => {
        if (!wsProvider?.wsconnected && !wsProvider?.synced) {
          maybeSeedTitle();
        }
      }, 5000);
      onProviderRef.current?.(wsProvider);
      setEditorState({ fragment, provider: wsProvider, ydoc });
    }

    if (idb.synced) {
      handleSync();
    } else {
      idb.on("synced", handleSync);
    }

    return () => {
      mounted = false;
      idb.off("synced", handleSync);
      titleText.unobserve(titleObserver);
      if (seedTitleTimeout !== null) {
        window.clearTimeout(seedTitleTimeout);
      }
      wsProvider?.off("sync", handleProviderSync);
      onProviderRef.current?.(null);
      wsProvider?.destroy();
      idb.destroy();
      ydoc.destroy();
    };
  }, [pageId]);

  const handleTitleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newVal = e.target.value;
      setTitle(newVal);
      if (!editorState) return;

      const titleText = editorState.ydoc.getText("page-title");
      editorState.ydoc.transact(() => {
        titleText.delete(0, titleText.length);
        titleText.insert(0, newVal);
      });
    },
    [editorState],
  );

  return (
    <div>
      <textarea
        value={title}
        onChange={handleTitleInput}
        disabled={!editorState}
        placeholder="Untitled"
        rows={1}
        className="mb-4 w-full resize-none overflow-hidden border-none bg-transparent pl-7 text-4xl font-bold tracking-tight text-zinc-100 placeholder-zinc-600 outline-none disabled:opacity-50"
        onInput={(e) => {
          const el = e.currentTarget;
          el.style.height = "auto";
          el.style.height = el.scrollHeight + "px";
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
      />

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
