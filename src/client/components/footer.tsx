import { Heart } from "lucide-react";

interface FooterProps {
  expanded: boolean;
}

export function Footer({ expanded }: FooterProps) {
  return (
    <footer className="hidden shrink-0 sm:block">
      <div
        className={`flex items-center justify-between border-t border-zinc-800/60 px-4 py-2 sm:px-6 ${expanded ? "" : "mx-auto max-w-7xl"}`}
      >
        <p className="flex items-center gap-1 text-xs text-zinc-500">
          Made with
          <Heart className="inline h-3 w-3 text-accent-500" />
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
  );
}
