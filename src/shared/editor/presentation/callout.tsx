import { AlertTriangle, Info, Lightbulb, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { DEFAULT_CALLOUT_KIND, normalizeCalloutKind, type CalloutKind } from "@/shared/editor/schema/callout-model";
import { bidAttribute, type BlockIdentityProps } from "./attrs";

interface CalloutKindMeta {
  label: string;
  Icon: LucideIcon;
}

export const CALLOUT_KIND_META: Record<CalloutKind, CalloutKindMeta> = {
  info: { label: "Info", Icon: Info },
  tip: { label: "Tip", Icon: Lightbulb },
  warning: { label: "Warning", Icon: AlertTriangle },
};

export interface CalloutKindContentProps {
  kind: unknown;
}

export function getCalloutKindMeta(kind: unknown): CalloutKindMeta {
  return CALLOUT_KIND_META[normalizeCalloutKind(kind)] ?? CALLOUT_KIND_META[DEFAULT_CALLOUT_KIND];
}

export function CalloutKindContent({ kind }: CalloutKindContentProps) {
  const { Icon, label } = getCalloutKindMeta(kind);
  return (
    <>
      <Icon size={14} aria-hidden />
      <span>{label}</span>
    </>
  );
}

export interface CalloutPresentationProps extends BlockIdentityProps {
  kind: unknown;
  controls?: ReactNode;
  readOnly?: boolean;
  children?: ReactNode;
}

export function CalloutPresentation({ bid, kind, controls, readOnly = false, children }: CalloutPresentationProps) {
  const normalizedKind = normalizeCalloutKind(kind);
  return (
    <div className="tiptap-callout" data-callout="" data-callout-kind={normalizedKind} {...bidAttribute(bid)}>
      {controls ?? (
        <div
          className="tiptap-callout-kind-btn"
          data-read-only={readOnly ? "" : undefined}
          aria-label={`Callout: ${getCalloutKindMeta(normalizedKind).label}`}
        >
          <CalloutKindContent kind={normalizedKind} />
        </div>
      )}
      <div className="tiptap-callout-body">{children}</div>
    </div>
  );
}
