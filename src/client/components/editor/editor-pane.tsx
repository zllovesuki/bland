import { useState, useEffect, useCallback, useRef } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { BlockNoteSchema, defaultBlockSpecs, createCodeBlockSpec } from "@blocknote/core";
import { createHighlighter } from "shiki";
import { Skeleton } from "@/client/components/ui/skeleton";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import YProvider from "y-partyserver/provider";
import type { Awareness } from "y-protocols/awareness";
import { YJS_PAGE_TITLE, YJS_DOCUMENT_STORE } from "@/shared/constants";
import { useAuthStore } from "@/client/stores/auth-store";
import { useWorkspaceStore } from "@/client/stores/workspace-store";
import { uploadFile } from "@/client/lib/uploads";
import { userColor } from "@/client/hooks/use-sync";
import "@blocknote/mantine/style.css";

interface EditorPaneProps {
  pageId: string;
  initialTitle: string;
  onTitleChange?: (title: string) => void;
  onProvider?: (provider: YProvider | null) => void;
  shareToken?: string;
  readOnly?: boolean;
  workspaceId?: string;
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
  readOnly,
  shareToken,
  workspaceId,
}: {
  fragment: Y.XmlFragment;
  provider: { awareness: Awareness };
  pageId: string;
  readOnly?: boolean;
  shareToken?: string;
  workspaceId?: string;
}) {
  const user = useAuthStore((s) => s.user);
  const workspace = useWorkspaceStore((s) => s.currentWorkspace);
  const resolvedWorkspaceId = workspaceId ?? workspace?.id;

  const handleUploadFile = useCallback(
    async (file: File) => {
      if (!resolvedWorkspaceId) throw new Error("No workspace");
      return uploadFile(resolvedWorkspaceId, file, pageId, shareToken);
    },
    [resolvedWorkspaceId, pageId, shareToken],
  );

  const resolveFileUrl = useCallback(
    async (url: string) => {
      if (shareToken && url.startsWith("/uploads/")) {
        return `${url}?share=${shareToken}`;
      }
      return url;
    },
    [shareToken],
  );

  const editor = useCreateBlockNote(
    {
      schema,
      collaboration: {
        provider,
        fragment,
        user: {
          name: user?.name ?? "Anonymous",
          color: userColor(user?.id ?? "anon"),
          avatar_url: user?.avatar_url ?? null,
        },
      },
      uploadFile: readOnly ? undefined : handleUploadFile,
      resolveFileUrl: shareToken ? resolveFileUrl : undefined,
    },
    [pageId],
  );

  return <BlockNoteView editor={editor} theme="dark" editable={!readOnly} />;
}

export function EditorPane({
  pageId,
  initialTitle,
  onTitleChange,
  onProvider,
  shareToken,
  readOnly,
  workspaceId,
}: EditorPaneProps) {
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
    const fragment = ydoc.getXmlFragment(YJS_DOCUMENT_STORE);
    const titleText = ydoc.getText(YJS_PAGE_TITLE);
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
      const hasToken = !!shareToken || !!useAuthStore.getState().accessToken;
      wsProvider = new YProvider(window.location.host, pageId, ydoc, {
        party: "doc-sync",
        connect: hasToken,
        params: shareToken
          ? () => ({ share: shareToken })
          : () => ({ token: useAuthStore.getState().accessToken || "" }),
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
  }, [pageId, shareToken]);

  const handleTitleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newVal = e.target.value;
      setTitle(newVal);
      if (!editorState) return;

      const titleText = editorState.ydoc.getText(YJS_PAGE_TITLE);
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
        readOnly={readOnly}
        placeholder="Untitled"
        rows={1}
        className="mb-4 w-full resize-none overflow-hidden border-none bg-transparent pl-7 text-4xl font-bold tracking-tight text-zinc-100 placeholder-zinc-600 outline-none disabled:opacity-50 read-only:cursor-default"
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
        <BlockEditor
          fragment={editorState.fragment}
          provider={editorState.provider}
          pageId={pageId}
          readOnly={readOnly}
          shareToken={shareToken}
          workspaceId={workspaceId}
        />
      ) : (
        <div className="space-y-3 pl-7">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-3/6" />
        </div>
      )}
    </div>
  );
}
