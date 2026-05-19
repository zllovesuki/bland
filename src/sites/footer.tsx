export function SiteFooter() {
  return (
    <footer className="site-footer mt-16 shrink-0 border-t border-zinc-800/60 px-4 sm:px-8">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-1 py-4 text-center">
        <a
          className="text-xs font-medium text-zinc-400 underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-zinc-200"
          href="https://bland.tools"
          rel="noopener noreferrer"
        >
          Made with bland
        </a>
        <p className="text-xs italic text-zinc-600">a place to put down your notes</p>
      </div>
    </footer>
  );
}
