import { DEFAULT_PAGE_TITLE } from "@/shared/constants";
import type { MentionEntry } from "@/client/components/page-mention/resolver";

export type PageMentionViewState =
  | {
      kind: "pending";
      interactive: false;
      label: "Pending...";
      ariaLabel: "Pending page mention";
    }
  | {
      kind: "restricted";
      interactive: false;
      label: "Restricted";
      ariaLabel: "Restricted page mention";
    }
  | {
      kind: "accessible";
      interactive: true;
      label: string;
      ariaLabel: string;
      icon: string | null;
      showFallbackIcon: boolean;
    };

export function getPageMentionViewState(entry: MentionEntry): PageMentionViewState {
  if (entry.status !== "resolved") {
    return {
      kind: "pending",
      interactive: false,
      label: "Pending...",
      ariaLabel: "Pending page mention",
    };
  }

  if (!entry.accessible) {
    return {
      kind: "restricted",
      interactive: false,
      label: "Restricted",
      ariaLabel: "Restricted page mention",
    };
  }

  const label = entry.title ?? DEFAULT_PAGE_TITLE;
  return {
    kind: "accessible",
    interactive: true,
    label,
    ariaLabel: label,
    icon: entry.icon,
    showFallbackIcon: !entry.icon,
  };
}
