import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, FileText, Loader2 } from "lucide-react";
import { api } from "@/client/lib/api";
import { useWorkspaceStore, selectActiveWorkspace } from "@/client/stores/workspace-store";
import type { SearchResult } from "@/shared/types";
import { DEFAULT_PAGE_TITLE } from "@/shared/constants";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
export const searchShortcutLabel = isMac ? "⌘K" : "Ctrl+K";

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const workspace = useWorkspaceStore(selectActiveWorkspace);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setHasError(false);
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    }
  }, [open]);

  const doSearch = useCallback(
    (q: string) => {
      if (!workspace || q.trim().length < 3) {
        setResults([]);
        setHasError(false);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      setHasError(false);
      const id = ++requestIdRef.current;
      api
        .search(workspace.id, q.trim())
        .then((r) => {
          if (id !== requestIdRef.current) return; // stale response
          setResults(r);
          setSelectedIndex(0);
        })
        .catch(() => {
          if (id === requestIdRef.current) {
            setResults([]);
            setHasError(true);
          }
        })
        .finally(() => {
          if (id === requestIdRef.current) setIsSearching(false);
        });
    },
    [workspace],
  );

  const handleInput = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSearch(value), 200);
    },
    [doSearch],
  );

  const selectResult = useCallback(
    (result: SearchResult) => {
      if (!workspace) return;
      onClose();
      navigate({
        to: "/$workspaceSlug/$pageId",
        params: { workspaceSlug: workspace.slug, pageId: result.page_id },
      });
    },
    [workspace, navigate, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[selectedIndex]) {
        e.preventDefault();
        selectResult(results[selectedIndex]);
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [results, selectedIndex, selectResult, onClose],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center pt-[15vh]"
      role="presentation"
      onClick={onClose}
    >
      <div className="fixed inset-0 bg-zinc-950/60" aria-hidden="true" />
      <div
        className="animate-scale-fade relative w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-zinc-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages..."
            aria-label="Search pages"
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-500 outline-none"
          />
          {isSearching && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />}
          <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
            Esc
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-1">
          {results.length === 0 && query.trim().length >= 3 && !isSearching && hasError && (
            <div className="px-4 py-8 text-center text-sm text-zinc-400">Search is down. Not your fault.</div>
          )}
          {results.length === 0 && query.trim().length >= 3 && !isSearching && !hasError && (
            <div className="px-4 py-8 text-center text-sm text-zinc-400">Nothing. Try different words.</div>
          )}
          {results.length === 0 && query.trim().length > 0 && query.trim().length < 3 && !isSearching && (
            <div className="px-4 py-8 text-center text-sm text-zinc-400">Type at least 3 characters</div>
          )}
          {results.length === 0 && query.trim().length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-zinc-400">Search across all your pages</div>
          )}
          {results.map((result, i) => (
            <button
              key={result.page_id}
              onClick={() => selectResult(result)}
              onMouseEnter={() => setSelectedIndex(i)}
              className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left opacity-0 animate-slide-up transition-colors ${
                i === selectedIndex ? "bg-zinc-800" : "hover:bg-zinc-800/50"
              }`}
              style={{ animationDelay: `${Math.min(i, 7) * 60}ms` }}
            >
              <span className="mt-0.5 shrink-0 text-base">
                {result.icon ?? <FileText className="h-4 w-4 text-zinc-500" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-zinc-200">{result.title || DEFAULT_PAGE_TITLE}</div>
                {result.snippet && (
                  <div
                    className="mt-0.5 truncate text-xs text-zinc-400 [&>mark]:bg-accent-500/30 [&>mark]:text-zinc-200"
                    dangerouslySetInnerHTML={{ __html: result.snippet }}
                  />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
