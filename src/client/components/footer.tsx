import { Heart } from "lucide-react";

interface FooterProps {
  expanded: boolean;
}

export function Footer({ expanded }: FooterProps) {
  return (
    <footer className="hidden shrink-0 border-t border-zinc-800/50 sm:block">
      <div className={`flex items-center justify-between px-4 py-2 sm:px-6 ${expanded ? "" : "mx-auto max-w-7xl"}`}>
        <p className="flex items-center gap-1 text-xs text-zinc-600">
          Made with
          <Heart className="inline h-3 w-3 text-accent-500" />
          on Cloudflare
        </p>
        <a
          href="https://devbin.tools"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-zinc-600 transition hover:text-zinc-400"
        >
          devbin.tools
        </a>
      </div>
    </footer>
  );
}
