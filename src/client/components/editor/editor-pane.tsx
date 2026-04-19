import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Skeleton } from "@/client/components/ui/skeleton";
import { PageTitle } from "@/client/components/ui/page-title";
import YProvider from "y-partyserver/provider";
import { reportClientError } from "@/client/lib/report-client-error";
import { toast } from "@/client/components/toast";
import { PageErrorState } from "@/client/components/ui/page-error-state";
import { EditorBody } from "./editor-body";
import type { EditorAffordance } from "@/client/lib/affordance/editor";
import { useEditorSession } from "./use-editor-session";

const INVALID_SCHEMA_MESSAGE = "This page contains content this editor version can't safely load. Refresh to update.";

interface EditorPaneProps {
  pageId: string;
  initialTitle: string;
  onTitleChange?: (title: string) => void;
  onProvider?: (provider: YProvider | null) => void;
  shareToken?: string;
  workspaceId?: string;
  affordance: EditorAffordance;
  outline?: EditorOutlinePlacement;
  docFooterLeading?: ReactNode;
}

export type EditorOutlinePlacement = { kind: "inline" } | { kind: "rail"; target: HTMLDivElement | null };

export function EditorPane({
  pageId,
  initialTitle,
  onTitleChange,
  onProvider,
  shareToken,
  workspaceId,
  affordance,
  outline,
  docFooterLeading,
}: EditorPaneProps) {
  const [schemaError, setSchemaError] = useState<Error | null>(null);
  const schemaErrorReportedRef = useRef(false);

  useEffect(() => {
    setSchemaError(null);
    schemaErrorReportedRef.current = false;
  }, [pageId, shareToken]);

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
    enabled: !schemaError,
  });

  return (
    <div>
      <PageTitle
        title={session.title}
        onInput={session.onTitleInput}
        disabled={session.kind !== "ready" || !!schemaError}
        readOnly={!affordance.documentEditable || schemaError !== null}
      />

      {schemaError ? (
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
          outline={outline}
          docFooterLeading={docFooterLeading}
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
