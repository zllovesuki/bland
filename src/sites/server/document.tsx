import { renderToStaticMarkup } from "react-dom/server";

import {
  DOC_PAGE_BALANCED_INLINE_OUTLINE_BEFORE_CLASS,
  DocumentFrame,
  PAGE_SHELL_CLASS,
} from "@/shared/editor/components/document-layout";
import { EditorMetricsPresentation } from "@/shared/editor/components/metrics";
import { OutlinePresentation } from "@/shared/editor/components/outline";
import { SiteIsland } from "@/sites/islands/island-host";
import { SiteOutlineController } from "@/sites/islands/site-outline-controller";
import { SiteFooter } from "./footer";
import { SiteHeader } from "./header";
import { SiteIconMark } from "./icons";
import {
  createSitesApexRenderContext,
  createSitesNotFoundRenderContext,
  readSitesDocumentAssets,
  readSitesHeaderRenderState,
  readSitesPageRenderState,
  runWithSitesReactRenderContext,
} from "./react-render-context";
import type { ApexDocumentProps, NotFoundDocumentProps, SitePageDocumentProps } from "./types";

function isGradient(cover: string): boolean {
  return cover.startsWith("linear-gradient(");
}

function PageIcon({ icon }: { icon: string }) {
  return (
    <SiteIconMark
      icon={icon}
      imageClassName="site-icon-img block h-7 w-7"
      glyphClassName="site-icon-glyph text-[1.75rem] leading-none"
      imageSize={28}
    />
  );
}

function SiteHead({
  title,
  canonicalUrl,
  ogTitle,
  ogUrl,
  ogType,
  description,
  includeModulePreloads = true,
}: {
  title: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogUrl?: string;
  ogType?: "article" | "website";
  description?: string | null;
  includeModulePreloads?: boolean;
}) {
  const assets = readSitesDocumentAssets();

  return (
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title}</title>
      <link rel="icon" href="/icons/favicon.ico" sizes="any" />
      <link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />
      <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32x32.png" />
      <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16x16.png" />
      <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
      <meta name="theme-color" content="#171717" />
      <link rel="preload" as="style" href={assets.fontStylesheetHref} />
      <link rel="stylesheet" href={assets.stylesheetHref} precedence="default" />
      {canonicalUrl ? <link rel="canonical" href={canonicalUrl} /> : null}
      {description ? <meta name="description" content={description} /> : null}
      {ogType ? <meta property="og:type" content={ogType} /> : null}
      {ogTitle ? <meta property="og:title" content={ogTitle} /> : null}
      {description ? <meta property="og:description" content={description} /> : null}
      {ogUrl ? <meta property="og:url" content={ogUrl} /> : null}
      {includeModulePreloads
        ? assets.modulePreloadHrefs.map((href) => <link key={href} rel="modulepreload" href={href} />)
        : null}
    </head>
  );
}

function SiteDeferredStyles() {
  const assets = readSitesDocumentAssets();
  return <link rel="stylesheet" href={assets.fontStylesheetHref} />;
}

export function SitePageDocument({ children }: SitePageDocumentProps) {
  const {
    page: { title, icon, coverUrl, outline, metrics, description, canonicalUrl },
  } = readSitesPageRenderState();
  const coverStyle = coverUrl
    ? { backgroundImage: isGradient(coverUrl) ? coverUrl : `url(${JSON.stringify(coverUrl)})` }
    : null;
  const hasOutline = outline.length > 0;

  return (
    <html lang="en" className="dark scheme-dark">
      <SiteHead
        title={title}
        canonicalUrl={canonicalUrl}
        ogTitle={title}
        ogUrl={canonicalUrl}
        ogType="article"
        description={description}
      />
      <body className="site-shell flex min-h-screen flex-col bg-canvas font-sans font-[450] text-zinc-100 antialiased">
        <SiteHeader />
        <main id="main-content" className={`site-main flex-1 ${PAGE_SHELL_CLASS}`}>
          <DocumentFrame
            main={
              <div className="site-container mx-auto min-w-0 max-w-3xl">
                {coverStyle ? (
                  <div
                    className="site-cover-wrapper group/cover relative -mx-4 -mt-10 mb-6 sm:-mx-8 lg:mx-0"
                    aria-hidden="true"
                  >
                    <div
                      className="site-cover h-48 w-full overflow-hidden rounded-b-lg bg-cover bg-center bg-no-repeat"
                      style={coverStyle}
                    />
                  </div>
                ) : null}
                {icon ? (
                  <div className="site-icon mb-4 flex min-h-9 items-center leading-none">
                    <PageIcon icon={icon} />
                  </div>
                ) : null}
                <h1 className="site-title mb-1.5 font-display text-3xl font-bold leading-9 tracking-[-0.03em] text-zinc-100 sm:text-4xl sm:leading-10">
                  {title}
                </h1>
                <div className="tiptap-document-lead">
                  {hasOutline ? (
                    <div className={DOC_PAGE_BALANCED_INLINE_OUTLINE_BEFORE_CLASS}>
                      <OutlinePresentation items={outline} mode="link" variant="card" />
                    </div>
                  ) : null}
                  <div className="tiptap tiptap-page-body">{children}</div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
                  <EditorMetricsPresentation metrics={metrics} />
                </div>
              </div>
            }
            rail={
              hasOutline ? (
                <SiteIsland name="site-outline-controller" props={{ items: outline }}>
                  <SiteOutlineController items={outline} />
                </SiteIsland>
              ) : undefined
            }
            railBalance="content"
          />
        </main>
        <SiteFooter />
        <SiteDeferredStyles />
      </body>
    </html>
  );
}

export function NotFoundDocument() {
  const header = readSitesHeaderRenderState();
  const site = header
    ? { workspaceName: header.workspaceName, workspaceIcon: header.workspaceIcon, homeHref: header.homeHref }
    : null;
  const heading = site ? "Nothing here to read." : "Nothing here.";
  const sub = site ? "This page is not published, or never was." : "This URL doesn't point to a bland site.";
  const ctaLabel = site ? `Back to ${site.workspaceName}` : "Visit bland.tools";
  const ctaHref = site ? site.homeHref : "https://bland.tools";
  const docTitle = site ? `Not found - ${site.workspaceName}` : "Not found - bland";

  return (
    <html lang="en" className="dark scheme-dark">
      <SiteHead title={docTitle} includeModulePreloads={false} />
      <body className="site-not-found flex min-h-screen flex-col bg-canvas font-sans font-[450] text-zinc-100 antialiased">
        {site ? <SiteHeader /> : null}
        <main className="flex flex-1 items-center justify-center px-4 py-16">
          <div className="max-w-md text-center">
            <p className="site-not-found-mark font-display text-7xl font-bold tracking-tighter text-zinc-700">404</p>
            <h1 className="mt-4 font-display text-xl font-semibold text-zinc-200">{heading}</h1>
            <p className="mt-2 text-sm text-zinc-400">{sub}</p>
            <a
              href={ctaHref}
              className="mt-6 inline-flex items-center gap-1 rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              {ctaLabel}
            </a>
          </div>
        </main>
        <SiteDeferredStyles />
      </body>
    </html>
  );
}

export function ApexDocument() {
  return (
    <html lang="en" className="dark scheme-dark">
      <SiteHead title="bland" includeModulePreloads={false} />
      <body className="site-apex flex min-h-screen items-center justify-center bg-canvas font-sans text-[1.75rem] tracking-[-0.02em] antialiased">
        <a
          href="https://bland.tools"
          rel="noopener noreferrer"
          aria-label="bland, visit bland.tools"
          className="site-apex-mark inline-block bg-[linear-gradient(135deg,oklch(0.72_0.22_25),oklch(0.78_0.18_60),oklch(0.88_0.18_95),oklch(0.78_0.20_145),oklch(0.70_0.20_240),oklch(0.65_0.22_305))] bg-clip-text font-semibold text-transparent transition-[filter,transform] duration-200 ease-out hover:scale-[1.02] hover:saturate-[1.15]"
        >
          bland.
        </a>
        <SiteDeferredStyles />
      </body>
    </html>
  );
}

export function renderSiteNotFoundDocumentHtml(props: NotFoundDocumentProps): string {
  return runWithSitesReactRenderContext(
    createSitesNotFoundRenderContext(props),
    () => `<!doctype html>${renderToStaticMarkup(<NotFoundDocument />)}`,
  );
}

export function renderApexDocumentHtml(props: ApexDocumentProps): string {
  return runWithSitesReactRenderContext(
    createSitesApexRenderContext(props),
    () => `<!doctype html>${renderToStaticMarkup(<ApexDocument />)}`,
  );
}

export function renderRobotsTxt(): string {
  return "User-agent: *\nAllow: /\n";
}
