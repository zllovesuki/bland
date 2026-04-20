import type { AiChatMessage } from "@/worker/lib/ai/types";

export interface RewritePromptInput {
  action: "proofread" | "formal" | "casual" | "simplify" | "expand";
  selectedText: string;
  parentBlock: string;
  beforeBlock: string;
  afterBlock: string;
  pageTitle: string;
}

export interface GeneratePromptInput {
  intent: "continue" | "explain" | "brainstorm";
  beforeBlock: string;
  afterBlock: string;
  pageTitle: string;
}

export interface AskHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export function buildRewriteMessages(data: RewritePromptInput): AiChatMessage[] {
  const instructions: Record<RewritePromptInput["action"], string> = {
    proofread: "Proofread the selection. Fix grammar, spelling, and punctuation. Preserve meaning and voice.",
    formal: "Rewrite the selection in a more formal, professional tone.",
    casual: "Rewrite the selection in a more casual, conversational tone.",
    simplify: "Simplify the selection so it is easier to read without losing information.",
    expand: "Expand the selection with more detail and supporting sentences while preserving voice.",
  };

  const system = [
    "You are a writing assistant embedded in a document editor.",
    instructions[data.action],
    "Return only the rewritten replacement for the selection. Do not include the surrounding paragraphs, labels, quotes, or explanations.",
  ].join(" ");

  const parts: string[] = [];
  if (data.pageTitle) parts.push(`Page title: ${data.pageTitle}`);
  if (data.beforeBlock) parts.push(`Previous block: ${data.beforeBlock}`);
  if (data.parentBlock) parts.push(`Current block: ${data.parentBlock}`);
  if (data.afterBlock) parts.push(`Next block: ${data.afterBlock}`);
  parts.push(`Selection to rewrite:\n${data.selectedText}`);

  return [
    { role: "system", content: system },
    { role: "user", content: parts.join("\n\n") },
  ];
}

export function buildGenerateMessages(data: GeneratePromptInput): AiChatMessage[] {
  const instructions: Record<GeneratePromptInput["intent"], string> = {
    continue:
      "Continue writing the document from the cursor. Match the existing voice, tense, and style. Produce 1-3 paragraphs.",
    explain: "Write a clear explanation that fits naturally at the cursor, grounded in the surrounding context.",
    brainstorm: "Brainstorm a concise bulleted list of ideas that fit the current context.",
  };

  const system = [
    "You are a writing assistant embedded in a document editor.",
    instructions[data.intent],
    "Return only the inserted text, with no preamble or labels.",
  ].join(" ");

  const parts: string[] = [];
  if (data.pageTitle) parts.push(`Page title: ${data.pageTitle}`);
  if (data.beforeBlock) parts.push(`Text before the cursor:\n${data.beforeBlock}`);
  if (data.afterBlock) parts.push(`Text after the cursor:\n${data.afterBlock}`);
  parts.push("Write the continuation at the cursor.");

  return [
    { role: "system", content: system },
    { role: "user", content: parts.join("\n\n") },
  ];
}

export function buildAskMessages(
  pageTitle: string,
  pageContext: string,
  question: string,
  history: AskHistoryTurn[],
): AiChatMessage[] {
  const system = [
    "You are a helpful assistant answering questions about a document.",
    "Use only the provided page content to answer. If the page does not contain the answer, say so.",
    pageTitle ? `Page title: ${pageTitle}` : "",
    pageContext ? `Page content:\n${pageContext}` : "Page content is empty.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages: AiChatMessage[] = [{ role: "system", content: system }];
  for (const turn of history) {
    messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({ role: "user", content: question });
  return messages;
}
