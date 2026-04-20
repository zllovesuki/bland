import type { Editor, Range } from "@tiptap/core";
import {
  Heading1,
  Heading2,
  Heading3,
  ChevronDown,
  Info,
  List,
  ListOrdered,
  ListChecks,
  Pilcrow,
  Quote,
  Code2,
  Minus,
  ImageIcon,
  Table,
  FileText,
  SmilePlus,
  Sparkles,
  PenLine,
  Lightbulb,
} from "lucide-react";
import { insertCalloutBlock } from "../callout";
import { insertDetailsBlock } from "../details-block";
import { canInsertPageMentionAtRange } from "../../lib/page-mention/can-insert";
import type { AiGenerateIntent } from "@/shared/types";

export interface SlashMenuItem {
  title: string;
  group: string;
  icon: React.FC<{ size?: number; className?: string }>;
  aliases?: string[];
  description?: string;
  isAvailable?: (props: { editor: Editor }) => boolean;
  isBlocked?: (props: { editor: Editor }) => string | null;
  command: (props: { editor: Editor; range: Range }) => void;
}

export interface ResolvedSlashMenuItem extends SlashMenuItem {
  blockedReason: string | null;
}

export interface SlashMenuPageMentionConfig {
  isAvailable?: (props: { editor: Editor }) => boolean;
  openPicker: (props: { editor: Editor; range: Range }) => void;
}

export interface SlashMenuImageConfig {
  isAvailable?: (props: { editor: Editor }) => boolean;
  insertImage: (props: { editor: Editor; range: Range }) => void;
}

export interface SlashMenuEmojiConfig {
  openPicker: (props: { editor: Editor; range: Range }) => void;
}

export interface SlashMenuAiConfig {
  isAvailable: (props: { editor: Editor }) => boolean;
  isBlocked?: (props: { editor: Editor }) => string | null;
  startGenerate: (props: { editor: Editor; range: Range; intent: AiGenerateIntent }) => void;
}

export interface SlashMenuItemsOpts {
  pageMention: SlashMenuPageMentionConfig | null;
  image: SlashMenuImageConfig;
  emoji: SlashMenuEmojiConfig;
  ai: SlashMenuAiConfig | null;
}

export function getSlashMenuItems(opts: SlashMenuItemsOpts): SlashMenuItem[] {
  const items: SlashMenuItem[] = [];

  if (opts.ai) {
    const aiConfig = opts.ai;
    const aiIsAvailable = ({ editor }: { editor: Editor }) => aiConfig.isAvailable({ editor });
    const aiIsBlocked = aiConfig.isBlocked
      ? ({ editor }: { editor: Editor }) => aiConfig.isBlocked!({ editor })
      : undefined;
    items.push(
      {
        title: "Continue writing",
        description: "Keep going from the cursor",
        group: "AI",
        icon: Sparkles,
        aliases: ["ai", "continue", "write"],
        isAvailable: aiIsAvailable,
        isBlocked: aiIsBlocked,
        command: ({ editor, range }) => aiConfig.startGenerate({ editor, range, intent: "continue" }),
      },
      {
        title: "Explain",
        description: "Expand on what's above",
        group: "AI",
        icon: PenLine,
        aliases: ["ai", "explain"],
        isAvailable: aiIsAvailable,
        isBlocked: aiIsBlocked,
        command: ({ editor, range }) => aiConfig.startGenerate({ editor, range, intent: "explain" }),
      },
      {
        title: "Brainstorm",
        description: "Draft related ideas",
        group: "AI",
        icon: Lightbulb,
        aliases: ["ai", "brainstorm", "ideas"],
        isAvailable: aiIsAvailable,
        isBlocked: aiIsBlocked,
        command: ({ editor, range }) => aiConfig.startGenerate({ editor, range, intent: "brainstorm" }),
      },
    );
  }

  items.push(
    {
      title: "Heading 1",
      group: "Headings",
      icon: Heading1,
      aliases: ["h1"],
      command: ({ editor, range }) => {
        editor.chain().focus(null, { scrollIntoView: false }).deleteRange(range).setHeading({ level: 1 }).run();
      },
    },
    {
      title: "Heading 2",
      group: "Headings",
      icon: Heading2,
      aliases: ["h2"],
      command: ({ editor, range }) => {
        editor.chain().focus(null, { scrollIntoView: false }).deleteRange(range).setHeading({ level: 2 }).run();
      },
    },
    {
      title: "Heading 3",
      group: "Headings",
      icon: Heading3,
      aliases: ["h3"],
      command: ({ editor, range }) => {
        editor.chain().focus(null, { scrollIntoView: false }).deleteRange(range).setHeading({ level: 3 }).run();
      },
    },
    {
      title: "Bullet List",
      group: "Lists",
      icon: List,
      aliases: ["ul", "unordered"],
      command: ({ editor, range }) => {
        editor.chain().focus(null, { scrollIntoView: false }).deleteRange(range).toggleBulletList().run();
      },
    },
    {
      title: "Ordered List",
      group: "Lists",
      icon: ListOrdered,
      aliases: ["ol", "numbered"],
      command: ({ editor, range }) => {
        editor.chain().focus(null, { scrollIntoView: false }).deleteRange(range).toggleOrderedList().run();
      },
    },
    {
      title: "Task List",
      group: "Lists",
      icon: ListChecks,
      aliases: ["todo", "checklist"],
      command: ({ editor, range }) => {
        editor.chain().focus(null, { scrollIntoView: false }).deleteRange(range).toggleTaskList().run();
      },
    },
    {
      title: "Details",
      group: "Basic blocks",
      icon: ChevronDown,
      aliases: ["details", "spoiler", "collapse"],
      command: ({ editor, range }) => {
        insertDetailsBlock(editor, range);
      },
    },
    {
      title: "Callout",
      group: "Basic blocks",
      icon: Info,
      aliases: ["callout", "note", "tip", "warning"],
      command: ({ editor, range }) => {
        insertCalloutBlock(editor, range);
      },
    },
    {
      title: "Paragraph",
      group: "Basic blocks",
      icon: Pilcrow,
      aliases: ["text", "plain"],
      command: ({ editor, range }) => {
        editor.chain().focus(null, { scrollIntoView: false }).deleteRange(range).setParagraph().run();
      },
    },
    {
      title: "Blockquote",
      group: "Basic blocks",
      icon: Quote,
      aliases: ["quote"],
      command: ({ editor, range }) => {
        editor.chain().focus(null, { scrollIntoView: false }).deleteRange(range).setBlockquote().run();
      },
    },
    {
      title: "Code Block",
      group: "Basic blocks",
      icon: Code2,
      aliases: ["code", "codeblock"],
      command: ({ editor, range }) => {
        editor.chain().focus(null, { scrollIntoView: false }).deleteRange(range).setCodeBlock().run();
      },
    },
    {
      title: "Horizontal Rule",
      group: "Basic blocks",
      icon: Minus,
      aliases: ["hr", "divider", "separator"],
      command: ({ editor, range }) => {
        editor.chain().focus(null, { scrollIntoView: false }).deleteRange(range).setHorizontalRule().run();
      },
    },
    {
      title: "Table",
      group: "Basic blocks",
      icon: Table,
      aliases: ["tbl", "grid"],
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus(null, { scrollIntoView: false })
          .deleteRange(range)
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run();
      },
    },
    {
      title: "Image",
      group: "Media",
      icon: ImageIcon,
      aliases: ["img", "picture", "photo"],
      isAvailable: ({ editor }) => (opts.image.isAvailable ? opts.image.isAvailable({ editor }) : true),
      command: ({ editor, range }) => {
        opts.image.insertImage({ editor, range });
      },
    },
    {
      title: "Emoji",
      group: "Insert",
      icon: SmilePlus,
      aliases: ["smile", "smiley", "face"],
      command: ({ editor, range }) => {
        opts.emoji.openPicker({ editor, range });
      },
    },
  );

  if (opts.pageMention) {
    const { openPicker } = opts.pageMention;
    items.push({
      title: "Link page",
      group: "Insert",
      icon: FileText,
      aliases: ["mention", "page", "reference"],
      isAvailable: ({ editor }) =>
        (!!opts.pageMention?.isAvailable ? opts.pageMention.isAvailable({ editor }) : true) &&
        canInsertPageMentionAtRange(editor),
      command: ({ editor, range }) => {
        openPicker({ editor, range });
      },
    });
  }

  return items;
}

export function filterItems(
  items: SlashMenuItem[],
  query: string,
  props?: { editor: Editor },
): ResolvedSlashMenuItem[] {
  const q = query.toLowerCase();
  const editor = props?.editor;
  const visible = items.filter(
    ({ title, aliases, isAvailable }) =>
      (!editor || !isAvailable || isAvailable({ editor })) &&
      (title.toLowerCase().includes(q) || (aliases && aliases.some((a) => a.toLowerCase().includes(q)))),
  );
  return visible.map((item) => ({
    ...item,
    blockedReason: editor && item.isBlocked ? (item.isBlocked({ editor }) ?? null) : null,
  }));
}
