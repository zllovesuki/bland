import type { EditorTextMetrics } from "@/shared/editor/schema/metrics";

const DEFAULT_WORDS_PER_MINUTE = 200;
const NUMBER_FORMATTER = new Intl.NumberFormat();

export interface EditorMetricsPresentationProps {
  metrics: EditorTextMetrics;
  className?: string;
}

function estimateReadTimeMinutes(wordCount: number, wordsPerMinute = DEFAULT_WORDS_PER_MINUTE): number {
  if (!Number.isFinite(wordCount) || wordCount <= 0) {
    return 0;
  }

  const safeWordsPerMinute = Math.max(1, wordsPerMinute);
  return Math.max(1, Math.ceil(wordCount / safeWordsPerMinute));
}

export function formatReadTime(wordCount: number, wordsPerMinute = DEFAULT_WORDS_PER_MINUTE): string {
  return `${estimateReadTimeMinutes(wordCount, wordsPerMinute)} min read`;
}

function formatNumber(value: number): string {
  return NUMBER_FORMATTER.format(value);
}

export function formatMetricCount(value: number, singular: string, plural: string): string {
  return `${formatNumber(value)} ${value === 1 ? singular : plural}`;
}

export function EditorMetricsPresentation({ metrics, className }: EditorMetricsPresentationProps) {
  const wordsLabel = formatMetricCount(metrics.words, "word", "words");
  const charsLabel = formatMetricCount(metrics.characters, "char", "chars");
  const readTimeLabel = formatReadTime(metrics.words);

  return (
    <div
      className={["flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-none text-zinc-500", className]
        .filter(Boolean)
        .join(" ")}
      aria-label={`Document metrics: ${wordsLabel}, ${charsLabel}, ${readTimeLabel}`}
    >
      <span>{wordsLabel}</span>
      <span aria-hidden="true" className="text-zinc-700">
        ·
      </span>
      <span>{charsLabel}</span>
      <span aria-hidden="true" className="text-zinc-700">
        ·
      </span>
      <span>{readTimeLabel}</span>
    </div>
  );
}
