import { useCallback, useEffect, useRef, useState } from "react";
import { FloatingPortal } from "@floating-ui/react";
import { X, CornerDownLeft, Loader2, RefreshCw } from "lucide-react";
import { summarizePage, streamAskPage, AiStreamError } from "@/client/lib/ai/api";
import type { AiAskHistoryMessage } from "@/shared/types";
import "./summarize-sheet.css";

interface SummarizeSheetProps {
  workspaceId: string;
  pageId: string;
  canSummarize: boolean;
  canAsk: boolean;
  open: boolean;
  onClose: () => void;
}

interface SummaryState {
  status: "idle" | "loading" | "ready" | "error";
  text: string;
  error: string | null;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  error?: boolean;
}

const EMPTY_SUMMARY_COPY = "The model returned an empty summary. Try again.";
const EMPTY_ANSWER_COPY = "The model returned no answer. Try again.";

function describeAiError(err: unknown, fallback: string): string {
  if (err instanceof AiStreamError && err.code === "page_empty") {
    return "Add something to this page before asking the model about it.";
  }
  if (err instanceof AiStreamError || err instanceof Error) return err.message;
  return fallback;
}

function SummarySection({ summary, onRetry }: { summary: SummaryState; onRetry: () => void }) {
  const isError = summary.status === "error";
  const isLoading = summary.status === "loading";
  const retryLabel = isError ? "Retry summary" : "Regenerate summary";

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Summary</h3>
        <button
          type="button"
          onClick={onRetry}
          disabled={isLoading}
          aria-label={retryLabel}
          title={retryLabel}
          className={
            isError
              ? "inline-flex items-center gap-1.5 rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-300 transition-colors hover:border-red-400/60 hover:bg-red-500/15 hover:text-red-200 focus-visible:border-red-400/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:cursor-not-allowed disabled:opacity-60"
              : "inline-flex items-center rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-700/60 hover:text-zinc-200 focus-visible:bg-zinc-700/60 focus-visible:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
          }
          data-testid="summarize-sheet-retry"
        >
          {isLoading ? (
            <Loader2 size={isError ? 12 : 14} className="animate-spin" />
          ) : (
            <RefreshCw size={isError ? 12 : 14} />
          )}
          {isError && <span>Retry</span>}
        </button>
      </div>
      {summary.status === "loading" && (
        <div
          role="status"
          aria-busy="true"
          aria-label="Summarizing the page"
          data-testid="summarize-sheet-skeleton"
          className="space-y-2"
        >
          <div className="h-3 rounded bg-zinc-700/55 motion-safe:animate-pulse" />
          <div className="h-3 w-[94%] rounded bg-zinc-700/55 motion-safe:animate-pulse" />
          <div className="h-3 w-[70%] rounded bg-zinc-700/55 motion-safe:animate-pulse" />
        </div>
      )}
      {summary.status === "error" && (
        <p className="text-red-300" data-testid="summarize-sheet-error">
          {summary.error}
        </p>
      )}
      {summary.status === "ready" && (
        <p data-testid="summarize-sheet-summary" className="whitespace-pre-wrap leading-relaxed text-zinc-200">
          {summary.text}
        </p>
      )}
    </section>
  );
}

function ChatMessageRow({ message }: { message: ChatMessage }) {
  // Note: sheet surface is bg-zinc-800. To keep contrast comfortable for
  // astigmatic reading on longer passages, body text sits at zinc-200
  // (not zinc-100) against both the neutral and accent-tinted fills.
  const style = message.error
    ? "rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-200"
    : message.role === "user"
      ? "rounded bg-accent-500/14 px-3 py-2 text-zinc-100"
      : "rounded bg-zinc-700/45 px-3 py-2 text-zinc-200";
  const testid =
    message.role !== "assistant"
      ? undefined
      : message.error
        ? "summarize-sheet-answer-error"
        : "summarize-sheet-answer";
  return (
    <div className={style} data-testid={testid}>
      <p className="whitespace-pre-wrap leading-relaxed">
        {message.content || (message.streaming ? <span className="italic text-zinc-400">Thinking…</span> : "")}
      </p>
    </div>
  );
}

function PageChatList({
  messages,
  chatEndRef,
}: {
  messages: ChatMessage[];
  chatEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Dig deeper</h3>
      <div className="space-y-3" aria-live="polite" aria-atomic="false">
        {messages.map((m) => (
          <ChatMessageRow key={m.id} message={m} />
        ))}
        <div ref={chatEndRef} />
      </div>
    </section>
  );
}

function ChatComposer({
  input,
  onChange,
  onSubmit,
  sending,
  inputRef,
}: {
  input: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  sending: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <form
      className="flex items-stretch gap-2 border-t border-zinc-700 px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <textarea
        ref={inputRef}
        value={input}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        rows={2}
        placeholder="Jarvis, …"
        aria-label="Ask a question about this page"
        className="flex-1 resize-none rounded border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-400 transition-colors focus:border-accent-500/50 focus:outline-none"
        data-testid="summarize-sheet-input"
      />
      <button
        type="submit"
        disabled={sending || input.trim().length === 0}
        aria-label="Send question (Enter)"
        className="flex w-11 shrink-0 items-center justify-center rounded bg-accent-500 text-white transition-colors hover:bg-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60 disabled:cursor-not-allowed disabled:opacity-40"
        data-testid="summarize-sheet-send"
      >
        {sending ? <Loader2 size={16} className="animate-spin" /> : <CornerDownLeft size={16} />}
      </button>
    </form>
  );
}

export function SummarizeSheet({ workspaceId, pageId, canSummarize, canAsk, open, onClose }: SummarizeSheetProps) {
  const [summary, setSummary] = useState<SummaryState>({ status: "idle", text: "", error: null });
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [summaryRequestToken, setSummaryRequestToken] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const lastFetchKey = useRef<string>("");

  // Reset sheet state when the target page changes. Closing the sheet should NOT wipe
  // cached summary, chat history, or a half-typed question.
  useEffect(() => {
    setSummary({ status: "idle", text: "", error: null });
    setMessages([]);
    setInput("");
    setSummaryRequestToken(0);
    lastFetchKey.current = "";
  }, [pageId, workspaceId]);

  // Fetch the summary the first time the sheet is opened for this (workspace, page),
  // or whenever the user asks to retry. Dedupe so reopening the sheet on the same
  // page reuses the cached result instead of refetching.
  useEffect(() => {
    if (!open || !canSummarize) return;
    const fetchKey = `${workspaceId}:${pageId}:${summaryRequestToken}`;
    if (lastFetchKey.current === fetchKey) return;
    lastFetchKey.current = fetchKey;

    let cancelled = false;
    setSummary({ status: "loading", text: "", error: null });
    summarizePage(workspaceId, pageId)
      .then((res) => {
        if (cancelled) return;
        const text = res.summary?.trim() ?? "";
        if (text.length === 0) {
          setSummary({ status: "error", text: "", error: EMPTY_SUMMARY_COPY });
          return;
        }
        setSummary({ status: "ready", text: res.summary, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSummary({ status: "error", text: "", error: describeAiError(err, "Summary failed") });
      });
    return () => {
      cancelled = true;
    };
  }, [open, canSummarize, pageId, workspaceId, summaryRequestToken]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages]);

  const retrySummary = useCallback(() => setSummaryRequestToken((n) => n + 1), []);

  const handleSubmit = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || sending || !canAsk) return;

    const userMessage: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: trimmed };
    const assistantId = `a-${Date.now()}`;
    const assistantMessage: ChatMessage = { id: assistantId, role: "assistant", content: "", streaming: true };
    const history: AiAskHistoryMessage[] = messages
      .filter((m): m is ChatMessage & { role: "user" | "assistant" } => !m.streaming && !m.error)
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    setSending(true);

    try {
      let accumulated = "";
      for await (const chunk of streamAskPage(workspaceId, pageId, { question: trimmed, history })) {
        if (!chunk.text) continue;
        accumulated += chunk.text;
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + chunk.text } : m)));
      }
      if (accumulated.trim().length === 0) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: EMPTY_ANSWER_COPY, streaming: false, error: true } : m,
          ),
        );
      } else {
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)));
      }
    } catch (err) {
      const message = describeAiError(err, "Ask failed");
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: message, streaming: false, error: true } : m)),
      );
    } finally {
      setSending(false);
    }
  }, [input, sending, canAsk, workspaceId, pageId, messages]);

  if (!open) return null;

  return (
    <FloatingPortal>
      {/* Ambient dim — pointer-events: none so the editor underneath stays
          interactive. Z-index sits below the sheet (z-40) and the top bar. */}
      <div
        className="summarize-sheet-backdrop pointer-events-none fixed inset-0 z-30 bg-zinc-950/25"
        aria-hidden="true"
      />
      <aside
        className="summarize-sheet fixed bottom-0 right-0 top-[60px] z-40 flex w-full max-w-md flex-col border-l border-zinc-700 bg-zinc-800 text-zinc-100 shadow-2xl"
        aria-label="Summarize and ask page"
        data-testid="summarize-sheet"
      >
        <header className="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-100">Quick take</h2>
          <button
            type="button"
            aria-label="Close summary panel (Escape)"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-700/60 hover:text-zinc-200 focus-visible:bg-zinc-700/60 focus-visible:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 text-sm" data-testid="summarize-sheet-body">
          {canSummarize && <SummarySection summary={summary} onRetry={retrySummary} />}
          {canAsk && <PageChatList messages={messages} chatEndRef={chatEndRef} />}
        </div>

        {canAsk && (
          <ChatComposer
            input={input}
            onChange={setInput}
            onSubmit={() => void handleSubmit()}
            sending={sending}
            inputRef={inputRef}
          />
        )}
      </aside>
    </FloatingPortal>
  );
}
