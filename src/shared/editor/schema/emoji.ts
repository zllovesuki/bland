import Emoji from "@tiptap/extension-emoji";

export const SharedEmoji = Emoji.configure({
  HTMLAttributes: {
    class: "tiptap-emoji",
  },
});
