import { Link } from "@tanstack/react-router";
import { FileText, Heart, ChevronRight, Circle, Search } from "lucide-react";
import { useDocumentTitle } from "@/client/hooks/use-document-title";

const STACK = ["Workers", "D1", "Durable Objects", "R2", "Queues"] as const;

const MOCK_SIDEBAR_PAGES = [
  { title: "Getting Started", depth: 0, active: false },
  { title: "Architecture", depth: 0, active: true },
  { title: "Workers API", depth: 1, active: false },
  { title: "Data Model", depth: 1, active: false },
  { title: "Deployment", depth: 0, active: false },
] as const;

export function LandingPage() {
  useDocumentTitle(undefined);

  return (
    <div className="relative min-h-screen">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-zinc-800/60 bg-zinc-900/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
            <div className="inline-grid h-9 w-9 place-items-center rounded-lg bg-accent-500">
              <FileText className="h-5 w-5 text-white" aria-hidden="true" />
            </div>
            <strong className="text-sm font-semibold text-zinc-100">bland</strong>
          </Link>
        </div>
      </nav>

      <main id="main-content">
        {/* Hero */}
        <section className="mx-auto max-w-7xl px-4 pb-16 pt-24 sm:px-6 sm:pt-32 lg:pt-40">
          <div className="ml-auto max-w-4xl text-right">
            <h1 className="font-display text-6xl font-bold leading-[1.08] tracking-[-0.03em] text-zinc-100 sm:text-7xl lg:text-8xl">
              <span className="animate-slide-up block opacity-0">Write together.</span>
              <span
                className="animate-slide-up block opacity-0 pr-1 text-accent-400 sm:pr-2"
                style={{ animationDelay: "80ms" }}
              >
                Ship on Cloudflare.
              </span>
            </h1>

            <p
              className="animate-slide-up ml-auto mt-8 max-w-xl text-lg leading-relaxed text-zinc-400 opacity-0"
              style={{ animationDelay: "160ms" }}
            >
              A block editor with real-time collaboration, nested pages, and full-text search. Runs entirely on
              Cloudflare Workers.
            </p>

            <div
              className="animate-slide-up mt-8 flex items-center justify-end gap-4 opacity-0"
              style={{ animationDelay: "240ms" }}
            >
              <span className="text-sm text-zinc-500">Invite only — ask your teammate for a link</span>
              <Link
                to="/login"
                search={{ redirect: undefined }}
                className="inline-flex items-center gap-2 rounded-xl bg-accent-600 px-5 py-2.5 text-sm font-medium text-white transition-[background-color,transform] hover:bg-accent-500 active:scale-[0.98]"
              >
                Sign in
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        {/* Product mockup */}
        <section className="relative mx-auto max-w-7xl px-4 pb-32 sm:px-6">
          <div
            className="animate-fade-in relative opacity-0"
            style={{
              animationDelay: "400ms",
              transform: "perspective(2400px) rotateY(-1.5deg) rotateX(1deg)",
            }}
          >
            <div className="overflow-hidden rounded-2xl border border-zinc-800/50 bg-zinc-800/40 shadow-2xl shadow-black/30">
              {/* Window chrome */}
              <div className="flex items-center gap-2 border-b border-zinc-800/40 px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-zinc-700/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-zinc-700/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-zinc-700/80" />
                <span className="ml-3 text-[11px] text-zinc-500">bland.tools</span>
              </div>

              {/* App body */}
              <div className="flex min-h-[340px] sm:min-h-[420px]">
                {/* Sidebar mock */}
                <div className="hidden w-52 shrink-0 border-r border-zinc-800/40 px-3 py-4 sm:block">
                  <div className="mb-3 flex items-center gap-2 px-2">
                    <div className="h-5 w-5 rounded bg-gradient-to-br from-accent-500/80 to-accent-600/80" />
                    <span className="text-xs font-medium text-zinc-300">My workspace</span>
                  </div>
                  <div className="space-y-0.5">
                    {MOCK_SIDEBAR_PAGES.map((p) => (
                      <div
                        key={p.title}
                        className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                          p.active ? "bg-accent-500/10 text-accent-400" : "text-zinc-500 hover:text-zinc-300"
                        }`}
                        style={{ paddingLeft: `${8 + p.depth * 16}px` }}
                      >
                        <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
                        {p.title}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Editor mock */}
                <div className="flex-1 px-6 py-6 sm:px-10 sm:py-8">
                  <h2 className="font-display text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
                    Architecture
                  </h2>
                  <p className="mt-4 max-w-lg text-sm leading-relaxed text-zinc-400">
                    The platform runs on Cloudflare Workers with Durable Objects for real-time document collaboration.{" "}
                    <span className="relative inline-flex items-baseline">
                      <span className="inline-block h-3.5 w-px animate-pulse bg-accent-400" />
                      <span className="ml-0.5 rounded-sm bg-accent-500/20 px-1 py-px text-[10px] font-medium leading-none text-accent-300">
                        Rachel
                      </span>
                    </span>{" "}
                    Each document is a lightweight server that handles WebSocket connections, Yjs sync, and persistence.
                  </p>

                  <div className="mt-5 space-y-2">
                    <div className="flex items-start gap-2 text-sm text-zinc-400">
                      <Circle className="mt-1.5 h-1.5 w-1.5 shrink-0 fill-zinc-500 text-zinc-500" aria-hidden="true" />
                      <span>Hono-based HTTP router for auth, CRUD, and search</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-zinc-400">
                      <Circle className="mt-1.5 h-1.5 w-1.5 shrink-0 fill-zinc-500 text-zinc-500" aria-hidden="true" />
                      <span>One Durable Object per document with Yjs state</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-zinc-400">
                      <Circle className="mt-1.5 h-1.5 w-1.5 shrink-0 fill-zinc-500 text-zinc-500" aria-hidden="true" />
                      <span>D1 as single source of truth for structured data</span>
                    </div>
                  </div>

                  {/* Code block mock */}
                  <div className="mt-5 rounded-lg border border-zinc-800/50 bg-zinc-950/60 px-4 py-3">
                    <pre className="font-mono text-xs leading-relaxed text-zinc-400">
                      <span className="text-accent-400">export class</span>{" "}
                      <span className="text-zinc-200">DocSync</span> <span className="text-accent-400">extends</span>{" "}
                      <span className="text-zinc-300">YServer</span> {"{"}
                      {"\n  "}
                      <span className="text-accent-400">async</span> <span className="text-zinc-300">onSave</span>
                      {"() { "}
                      <span className="text-zinc-500">/* ... */</span>
                      {" }"}
                      {"\n}"}
                    </pre>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom gradient mask */}
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
              style={{
                background: "linear-gradient(to top, var(--color-canvas), transparent)",
              }}
              aria-hidden="true"
            />
          </div>
        </section>

        {/* Features — bento grid */}
        <section className="mx-auto max-w-7xl px-4 pb-28 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Collaboration — wide card */}
            <div className="group relative overflow-hidden rounded-2xl border border-zinc-800/50 bg-zinc-800/40 p-6 sm:col-span-2 lg:col-span-2">
              <div className="relative z-10">
                <h3 className="font-display text-lg font-semibold tracking-tight text-zinc-100">
                  Real-time collaboration
                </h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-500">
                  Live cursors and presence. Every document is a lightweight server built on Yjs and Durable Objects.
                </p>
              </div>
              {/* Mini visual — two cursors editing */}
              <div className="mt-5 rounded-lg border border-zinc-800/40 bg-zinc-950/50 px-4 py-3">
                <p className="text-sm leading-relaxed text-zinc-500">
                  The Worker handles WebSocket
                  <span className="relative mx-0.5 inline-flex items-baseline">
                    <span className="inline-block h-3.5 w-px animate-pulse bg-emerald-400" />
                    <span className="ml-0.5 rounded-sm bg-emerald-500/20 px-1 py-px text-[10px] font-medium leading-none text-emerald-300">
                      Alex
                    </span>
                  </span>{" "}
                  connections and syncs Yjs state across all connected clients in the room.
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span className="text-[11px] text-zinc-500">Alex</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
                    <span className="text-[11px] text-zinc-500">Rachel</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    <span className="text-[11px] text-zinc-500">Sam</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Search — tall card */}
            <div className="group relative overflow-hidden rounded-2xl border border-zinc-800/50 bg-zinc-800/40 p-6 sm:row-span-2">
              <h3 className="font-display text-lg font-semibold tracking-tight text-zinc-100">Full-text search</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                FTS5-powered instant search across every page in the workspace.
              </p>
              {/* Mini visual — search UI */}
              <div className="mt-5 space-y-2">
                <div className="flex items-center gap-2 rounded-lg border border-zinc-700/50 bg-zinc-950/60 px-3 py-2">
                  <Search className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
                  <span className="text-xs text-zinc-400">durable objects</span>
                  <span className="ml-auto text-[10px] text-zinc-700">⌘K</span>
                </div>
                {[
                  { title: "Architecture", match: "…Durable Objects for real-time…" },
                  { title: "Workers API", match: "…each Durable Object handles…" },
                  { title: "Data Model", match: "…Object storage and D1…" },
                ].map((r) => (
                  <div
                    key={r.title}
                    className="rounded-lg border border-transparent bg-zinc-800/30 px-3 py-2 transition-colors first:border-accent-500/20 first:bg-accent-500/[0.06]"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-3 w-3 text-zinc-500" aria-hidden="true" />
                      <span className="text-xs font-medium text-zinc-300">{r.title}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{r.match}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Block types — compact card */}
            <div className="group relative overflow-hidden rounded-2xl border border-zinc-800/50 bg-zinc-800/40 p-6 sm:col-span-2 lg:col-span-2">
              <div className="relative z-10">
                <h3 className="font-display text-lg font-semibold tracking-tight text-zinc-100">Rich block editor</h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-500">
                  Headings, lists, code blocks with syntax highlighting, tables, images, toggles, and more — all from a
                  slash menu.
                </p>
              </div>
              {/* Mini visual — block sampler */}
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                {/* Code block */}
                <div className="rounded-lg border border-zinc-800/40 bg-zinc-950/50 px-3 py-2.5">
                  <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    Code
                  </span>
                  <pre className="font-mono text-[11px] leading-relaxed text-zinc-500">
                    <span className="text-accent-400">const</span> <span className="text-zinc-300">doc</span> ={" "}
                    <span className="text-accent-400">new</span> <span className="text-zinc-300">Y.Doc</span>()
                  </pre>
                </div>
                {/* Task list */}
                <div className="rounded-lg border border-zinc-800/40 bg-zinc-950/50 px-3 py-2.5">
                  <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    Tasks
                  </span>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="inline-grid h-3.5 w-3.5 place-items-center rounded border border-accent-500/40 bg-accent-500/10 text-[8px] text-accent-400">
                        ✓
                      </span>
                      <span className="text-zinc-500 line-through">Set up D1 schema</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="inline-block h-3.5 w-3.5 rounded border border-zinc-700" />
                      <span className="text-zinc-400">Wire search indexer</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="inline-block h-3.5 w-3.5 rounded border border-zinc-700" />
                      <span className="text-zinc-400">Deploy to prod</span>
                    </div>
                  </div>
                </div>
                {/* Table */}
                <div className="rounded-lg border border-zinc-800/40 bg-zinc-950/50 px-3 py-2.5">
                  <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    Table
                  </span>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-zinc-800/50 text-left text-zinc-500">
                        <th className="pb-1 pr-3 font-medium">Binding</th>
                        <th className="pb-1 font-medium">Type</th>
                      </tr>
                    </thead>
                    <tbody className="text-zinc-500">
                      <tr className="border-b border-zinc-800/30">
                        <td className="py-0.5 pr-3 text-zinc-400">DB</td>
                        <td className="py-0.5">D1</td>
                      </tr>
                      <tr className="border-b border-zinc-800/30">
                        <td className="py-0.5 pr-3 text-zinc-400">R2</td>
                        <td className="py-0.5">Bucket</td>
                      </tr>
                      <tr>
                        <td className="py-0.5 pr-3 text-zinc-400">DocSync</td>
                        <td className="py-0.5">DO</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Stack ribbon */}
        <section className="border-t border-zinc-800/40 py-10">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 sm:px-6">
            {STACK.map((item, i) => (
              <span key={item} className="flex items-center gap-5">
                <span className="font-mono text-xs uppercase tracking-[0.15em] text-zinc-500">{item}</span>
                {i < STACK.length - 1 && (
                  <span className="text-zinc-800" aria-hidden="true">
                    /
                  </span>
                )}
              </span>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/40 py-6">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
          <p className="flex items-center gap-1 text-xs text-zinc-500">
            Made with
            <Heart className="inline h-3 w-3 text-accent-500" aria-hidden="true" />
            on Cloudflare
          </p>
          <div className="flex items-center gap-4">
            <a
              href="https://git-on-cloudflare.com/rachel/bland"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-500 underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-accent-400"
            >
              Source code
            </a>
            <a
              href="https://devbin.tools"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-500 underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-accent-400"
            >
              Part of devbin.tools
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
