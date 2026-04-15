const DEFAULT_WORDS_PER_MINUTE = 200;

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
