export type AiInlineContent = { type: "text"; text: string };

export type AiBlockContent =
  | { type: "paragraph"; content?: AiInlineContent[] }
  | { type: "bulletList"; content: AiListItemContent[] };

export interface AiListItemContent {
  type: "listItem";
  content: Array<{ type: "paragraph"; content?: AiInlineContent[] }>;
}

const BULLET_LINE = /^\s*[-*]\s+(.*)$/;

export function parseAiBlocksFromText(raw: string): AiBlockContent[] {
  const normalized = raw
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+\n/g, "\n")
    .trim();
  if (!normalized) return [];

  const segments = normalized.split(/\n{2,}/);
  const blocks: AiBlockContent[] = [];

  for (const segment of segments) {
    const lines = segment.split("\n");
    const bulletItems: string[] = [];
    let isAllBullets = lines.length > 0;
    for (const line of lines) {
      const match = BULLET_LINE.exec(line);
      if (!match) {
        isAllBullets = false;
        break;
      }
      bulletItems.push(match[1].trim());
    }

    if (isAllBullets && bulletItems.length > 0) {
      blocks.push({
        type: "bulletList",
        content: bulletItems.map((text) => ({
          type: "listItem",
          content: [paragraphNode(text)],
        })),
      });
      continue;
    }

    const paragraphText = lines
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ");
    blocks.push(paragraphNode(paragraphText));
  }

  return blocks;
}

export function isSingleInlineParagraph(blocks: AiBlockContent[]): boolean {
  return blocks.length === 1 && blocks[0].type === "paragraph";
}

export function getInlineTextFromParagraph(block: AiBlockContent): string {
  if (block.type !== "paragraph" || !block.content) return "";
  return block.content.map((node) => node.text).join("");
}

function paragraphNode(text: string): { type: "paragraph"; content?: AiInlineContent[] } {
  if (!text) return { type: "paragraph" };
  return { type: "paragraph", content: [{ type: "text", text }] };
}
