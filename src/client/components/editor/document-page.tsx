import { useCallback, useRef, useState, type ReactNode } from "react";
import type YProvider from "y-partyserver/provider";
import { PageErrorState } from "@/client/components/ui/page-error-state";
import { PageTitleSection } from "@/client/components/ui/page-title-section";
import { Skeleton } from "@/client/components/ui/skeleton";
import {
  DocumentFrame,
  type DocumentOutlineMode,
  OUTLINE_RAIL_MEDIA_QUERY,
  PAGE_CONTENT_COLUMN_CLASS,
  PAGE_SHELL_CLASS,
} from "@/shared/editor/presentation/document-layout";
import { useMediaQuery } from "@/client/hooks/use-media-query";
import type { EditorAffordance } from "@/client/lib/affordance/editor";
import { reportClientError } from "@/client/lib/report-client-error";
import { toast } from "@/client/components/toast-store";
import { EditorBody } from "./editor-body";
import { useEditorSession } from "./use-editor-session";

const INVALID_SCHEMA_MESSAGE = "This build can't parse this page. Reload to catch up.";
const SNAPSHOT_ERROR_MESSAGE = "This page didn't load. Your connection might be flaky.";

interface DocumentPageProps {
  pageId: string;
  initialTitle: string;
  onTitleChange?: (title: string) => void;
  onProvider?: (provider: YProvider | null) => void;
  shareToken?: string;
  workspaceId?: string;
  affordance: EditorAffordance;
  outlineMode: DocumentOutlineMode;
  chrome: ReactNode;
  docFooterLeading?: ReactNode;
}

export function DocumentPage({
  pageId,
  initialTitle,
  onTitleChange,
  onProvider,
  shareToken,
  workspaceId,
  affordance,
  outlineMode,
  chrome,
  docFooterLeading,
}: DocumentPageProps) {
  const [outlineTarget, setOutlineTargetState] = useState<HTMLDivElement | null>(null);
  const setOutlineTarget = useCallback((node: HTMLDivElement | null) => {
    setOutlineTargetState(node);
  }, []);

  // The rail layout is only realized in CSS at min-[1440px]; below that, an
  // <aside> stacks after the main column and the outline would render below
  // metrics. Gate the JS placement on the same breakpoint so callers can keep
  // expressing intent without re-deriving viewport state.
  const railViewport = useMediaQuery(OUTLINE_RAIL_MEDIA_QUERY);
  const effectiveOutlineMode: DocumentOutlineMode = outlineMode === "rail" && railViewport ? "rail" : "inline";

  const [schemaError, setSchemaError] = useState<Error | null>(null);
  const schemaErrorReportedRef = useRef(false);

  const handleSchemaError = useCallback(
    (error: Error) => {
      setSchemaError((current) => current ?? error);

      if (schemaErrorReportedRef.current) return;
      schemaErrorReportedRef.current = true;

      reportClientError({
        source: "editor.invalid-schema",
        error,
        context: {
          pageId,
          workspaceId,
          hasShareToken: !!shareToken,
          readOnly: !affordance.documentEditable,
        },
      });
      toast.error(INVALID_SCHEMA_MESSAGE);
    },
    [pageId, affordance.documentEditable, shareToken, workspaceId],
  );

  const session = useEditorSession({
    pageId,
    initialTitle,
    onTitleChange,
    onProvider,
    shareToken,
    workspaceId,
    enabled: !schemaError,
  });

  const titleProps = {
    title: session.title,
    onInput: session.onTitleInput,
    disabled: session.kind !== "ready" || !!schemaError,
    readOnly: !affordance.documentEditable || schemaError !== null,
  };

  const body = schemaError ? (
    <PageErrorState
      message={INVALID_SCHEMA_MESSAGE}
      className="min-h-[12rem]"
      action={{ label: "Reload", onClick: () => window.location.reload() }}
    />
  ) : session.kind === "ready" ? (
    <EditorBody
      fragment={session.fragment}
      provider={session.provider}
      pageId={pageId}
      shareToken={shareToken}
      workspaceId={workspaceId}
      affordance={affordance}
      onSchemaError={handleSchemaError}
      outline={effectiveOutlineMode === "rail" ? { kind: "rail", target: outlineTarget } : { kind: "inline" }}
      docFooterLeading={docFooterLeading}
    />
  ) : session.kind === "error" ? (
    <PageErrorState
      message={SNAPSHOT_ERROR_MESSAGE}
      className="min-h-[12rem]"
      action={{ label: "Retry", onClick: session.onRetry }}
    />
  ) : (
    <div className="mt-4 space-y-3 pl-7">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-3/6" />
    </div>
  );

  const showRail = effectiveOutlineMode === "rail";

  return (
    <div className={PAGE_SHELL_CLASS}>
      <DocumentFrame
        main={
          <>
            {chrome}
            <PageTitleSection {...titleProps} />
            <div className={PAGE_CONTENT_COLUMN_CLASS}>{body}</div>
          </>
        }
        rail={showRail ? <></> : undefined}
        railRef={setOutlineTarget}
      />
    </div>
  );
}
