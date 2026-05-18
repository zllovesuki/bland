import { Fragment, type ReactNode } from "react";
import { normalizeCalloutKind } from "@/shared/editor/schema/callout-model";
import { resolveLanguage } from "@/shared/editor/schema/code-block-model";
import { CalloutPresentation } from "@/shared/editor/components/callout";
import { highlightCodeToSegments } from "@/shared/editor/components/code-highlight";
import { CodeBlockPresentation, getCodeLanguageLabel } from "@/shared/editor/components/code-block";
import { PageMentionPresentation } from "@/shared/editor/components/page-mention";
import { readOutlineLevel, type OutlineLevel } from "@/shared/editor/components/outline-model";
import { SiteIsland } from "@/sites/islands/island-host";
import { CopyCodeButton } from "@/sites/islands/copy-code-button";
import { SitesImage } from "@/sites/islands/sites-image";
import type { SitesImageProps } from "@/sites/shared/island-schemas";
import { readOptionalSitesReactRenderContext } from "@/sites/server/react-render-context";
import { readOptionalString, readPositiveNumber } from "./attrs";
import type { StaticNodeMappingProps } from "./types";

type HeadingTag = `h${OutlineLevel}`;
type ParagraphTextAlign = "left" | "center" | "right" | "justify";

const HEADING_TAGS: Record<OutlineLevel, HeadingTag> = {
  1: "h1",
  2: "h2",
  3: "h3",
  4: "h4",
  5: "h5",
  6: "h6",
};

export function createBlandSitesStaticNodeMappings() {
  const renderContext = readOptionalSitesReactRenderContext();
  const pageContext = renderContext?.kind === "page" ? renderContext : null;
  let headingIndex = 0;

  return {
    heading: ({ node, children }: StaticNodeMappingProps) => {
      const level = readOutlineLevel(node.attrs.level);
      const Tag = readHeadingTag(level);
      const bid = readOptionalString(node.attrs.bid);
      const anchorId = pageContext ? readHeadingAnchorId(pageContext.headingAnchorIds, headingIndex++) : undefined;
      const textAlign = readParagraphTextAlign(node.attrs.textAlign);
      const style = textAlign ? { textAlign } : undefined;
      return (
        <Tag id={anchorId} data-bid={bid ?? undefined} style={style}>
          {children}
        </Tag>
      );
    },
    paragraph: ({ node, children }: StaticNodeMappingProps) => {
      const bid = readOptionalString(node.attrs.bid);
      const textAlign = readParagraphTextAlign(node.attrs.textAlign);
      const style = textAlign ? { textAlign } : undefined;
      return (
        <p data-bid={bid ?? undefined} style={style}>
          {node.childCount === 0 ? <br /> : children}
        </p>
      );
    },
    taskItem: ({ node, children }: StaticNodeMappingProps) => {
      const checked = readBooleanTaskChecked(node.attrs.checked);
      return (
        <li data-type="taskItem" data-checked={checked ? "true" : "false"}>
          <label>
            <input
              type="checkbox"
              defaultChecked={checked}
              disabled
              aria-label={getTaskItemCheckboxLabel(node.textContent, checked)}
            />
            <span />
          </label>
          <div>{children}</div>
        </li>
      );
    },
    details: ({ node, children }: StaticNodeMappingProps) => {
      const open = node.attrs.open === true || node.attrs.open === "true";
      const bid = readOptionalString(node.attrs.bid);
      return (
        <details className="tiptap-details" data-bid={bid ?? undefined} open={open}>
          {children}
        </details>
      );
    },
    detailsSummary: ({ node, children }: StaticNodeMappingProps) => {
      const placeholder = readOptionalString(node.attrs.placeholder) ?? "Summary";
      return (
        <summary className="tiptap-details-summary" data-placeholder={placeholder}>
          {node.childCount === 0 ? <br /> : children}
        </summary>
      );
    },
    detailsContent: ({ children }: StaticNodeMappingProps) => (
      <div className="tiptap-details-content" data-type="detailsContent">
        {children}
      </div>
    ),
    callout: ({ node, children }: StaticNodeMappingProps) => (
      <CalloutPresentation
        bid={readOptionalString(node.attrs.bid)}
        kind={normalizeCalloutKind(node.attrs.kind)}
        readOnly
      >
        {children}
      </CalloutPresentation>
    ),
    codeBlock: ({ node }: StaticNodeMappingProps) => {
      const language = resolveLanguage(node.attrs.language);
      return (
        <CodeBlockPresentation
          bid={readOptionalString(node.attrs.bid)}
          language={language}
          controls={<StaticCodeBlockControls language={language} />}
        >
          {renderHighlightedCode(language, node.textContent)}
        </CodeBlockPresentation>
      );
    },
    image: ({ node }: StaticNodeMappingProps) => {
      const imageProps = readImageProps(node);
      if (!imageProps) return null;
      return (
        <SiteIsland name="sites-image" props={imageProps}>
          <SitesImage {...imageProps} />
        </SiteIsland>
      );
    },
    pageMention: ({ node }: StaticNodeMappingProps) => {
      const pageId = readOptionalString(node.attrs.pageId);
      const mention = pageId && pageContext ? pageContext.resolvePageMention(pageId) : null;
      return (
        <PageMentionPresentation
          pageId={pageId}
          label={mention?.label}
          href={mention?.href}
          icon={mention?.icon}
          kind={mention?.kind}
          ariaLabel={mention?.ariaLabel}
        />
      );
    },
    tableRow: ({ node, children }: StaticNodeMappingProps) => {
      const height = readPositiveNumber(node.attrs.height);
      const style = height ? { height: `${height}px` } : undefined;
      return <tr style={style}>{children}</tr>;
    },
    tableCell: ({ node, children }: StaticNodeMappingProps) => {
      const colSpan = readPositiveNumber(node.attrs.colspan) ?? 1;
      const rowSpan = readPositiveNumber(node.attrs.rowspan) ?? 1;
      const colwidth = Array.isArray(node.attrs.colwidth) ? (node.attrs.colwidth as number[]) : null;
      return (
        <td colSpan={colSpan} rowSpan={rowSpan} data-colwidth={colwidth ? colwidth.join(",") : undefined}>
          {children}
        </td>
      );
    },
    tableHeader: ({ node, children }: StaticNodeMappingProps) => {
      const colSpan = readPositiveNumber(node.attrs.colspan) ?? 1;
      const rowSpan = readPositiveNumber(node.attrs.rowspan) ?? 1;
      const colwidth = Array.isArray(node.attrs.colwidth) ? (node.attrs.colwidth as number[]) : null;
      return (
        <th colSpan={colSpan} rowSpan={rowSpan} data-colwidth={colwidth ? colwidth.join(",") : undefined}>
          {children}
        </th>
      );
    },
  };
}

function readHeadingTag(level: OutlineLevel): HeadingTag {
  return HEADING_TAGS[level];
}

function readHeadingAnchorId(anchorIds: readonly (string | null)[], index: number): string | undefined {
  const anchorId = anchorIds[index];
  return typeof anchorId === "string" ? anchorId : undefined;
}

function readParagraphTextAlign(value: unknown): ParagraphTextAlign | null {
  switch (value) {
    case "left":
    case "center":
    case "right":
    case "justify":
      return value;
    default:
      return null;
  }
}

function readImageProps(node: StaticNodeMappingProps["node"]): SitesImageProps | null {
  const src = readOptionalString(node.attrs.src);
  if (!src) return null;
  const align = node.attrs.align === "center" || node.attrs.align === "right" ? node.attrs.align : "left";
  return {
    bid: readOptionalString(node.attrs.bid),
    src,
    alt: readOptionalString(node.attrs.alt),
    title: readOptionalString(node.attrs.title),
    align,
    width: readPositiveNumber(node.attrs.width),
    naturalWidth: readPositiveNumber(node.attrs.naturalWidth),
    naturalHeight: readPositiveNumber(node.attrs.naturalHeight),
  };
}

function readBooleanTaskChecked(value: unknown): boolean {
  return value === true || value === "true" || value === "";
}

function getTaskItemCheckboxLabel(textContent: string, checked: boolean): string {
  const label = textContent.trim() || "empty task item";
  return `Task item checkbox for ${label}${checked ? ", checked" : ", unchecked"}`;
}

function StaticCodeBlockControls({ language }: { language: string }) {
  const displayName = getCodeLanguageLabel(language);

  return (
    <div className="tiptap-code-block-controls" contentEditable={false}>
      <SiteIsland name="copy-code" props={{}}>
        <CopyCodeButton />
      </SiteIsland>
      <button type="button" className="tiptap-code-block-lang-btn" aria-label={`Language: ${displayName}`} disabled>
        {displayName}
      </button>
    </div>
  );
}

function renderHighlightedCode(language: string, code: string): ReactNode[] {
  return highlightCodeToSegments(language, code).map((segment, index) => {
    if (segment.classes.length === 0) {
      return <Fragment key={index}>{segment.text}</Fragment>;
    }

    return (
      <span key={index} className={segment.classes.join(" ")}>
        {segment.text}
      </span>
    );
  });
}
