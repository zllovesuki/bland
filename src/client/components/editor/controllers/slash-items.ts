import type { Editor, Range } from "@tiptap/core";
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Pilcrow,
  Quote,
  Code2,
  Minus,
  ImageIcon,
} from "lucide-react";
export interface SlashMenuItem {
  title: string;
  group: string;
  icon: React.FC<{ size?: number; className?: string }>;
  aliases?: string[];
  command: (props: { editor: Editor; range: Range }) => void;
}

export function getSlashMenuItems(): SlashMenuItem[] {
  return [
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
      title: "Image",
      group: "Media",
      icon: ImageIcon,
      aliases: ["img", "picture", "photo"],
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus(null, { scrollIntoView: false })
          .deleteRange(range)
          .insertContent({
            type: "image",
            attrs: {
              src: "",
              pendingInsertId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            },
          })
          .run();
      },
    },
  ];
}

export function filterItems(items: SlashMenuItem[], query: string): SlashMenuItem[] {
  const q = query.toLowerCase();
  return items.filter(
    ({ title, aliases }) =>
      title.toLowerCase().includes(q) || (aliases && aliases.some((a) => a.toLowerCase().includes(q))),
  );
}
