import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { Image } from "@tiptap/extension-image";
import { StarterKit } from "@tiptap/starter-kit";
import { NodeSelection } from "@tiptap/pm/state";
import { MAX_UPLOAD_SIZE } from "@/shared/constants";
import {
  IMAGE_TARGET_MISSING_MESSAGE,
  getLocalImagePreview,
  insertImagePlaceholderAtPos,
  insertImagePlaceholderAtRange,
  replaceImageSourceAtTarget,
  resolveImageTargetPos,
  uploadAndReplaceImageAtTarget,
  type ImageNodeTarget,
} from "@/client/components/editor/lib/media-actions";

const uploadFileMock = vi.hoisted(() => vi.fn());
const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
}));

vi.mock("@/client/lib/uploads", () => ({
  uploadFile: uploadFileMock,
}));

vi.mock("@/client/components/toast", () => ({
  toast: toastMocks,
}));

const ImageWithUploadAttrs = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: { default: "left" },
      naturalWidth: { default: null },
      naturalHeight: { default: null },
      pendingInsertId: { default: null },
    };
  },
});

function createEditor(content: Record<string, unknown>, extensions = [StarterKit, Image]) {
  return new Editor({
    extensions,
    content,
  });
}

function stubLoadedImage(width: number, height: number) {
  class LoadedImage {
    naturalWidth = width;
    naturalHeight = height;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    set src(_src: string) {
      queueMicrotask(() => this.onload?.());
    }
  }

  vi.stubGlobal("Image", LoadedImage);
}

describe("image media actions", () => {
  beforeEach(() => {
    uploadFileMock.mockReset();
    toastMocks.error.mockReset();
    toastMocks.info.mockReset();
    toastMocks.success.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("inserts an image placeholder and selects it", () => {
    const editor = createEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "/img" }],
        },
      ],
    });

    try {
      const paragraph = editor.state.doc.firstChild;
      expect(paragraph).not.toBeNull();

      const inserted = insertImagePlaceholderAtRange(editor, { from: 1, to: paragraph!.content.size + 1 });

      expect(inserted).not.toBeNull();
      const pos = resolveImageTargetPos(editor, inserted!.target);

      expect(pos).not.toBeNull();
      expect(editor.state.doc.nodeAt(pos!)?.type.name).toBe("image");
      expect(editor.state.selection).toBeInstanceOf(NodeSelection);
      expect(editor.state.selection.from).toBe(pos);
      expect(inserted?.nextPos).toBe((pos ?? 0) + editor.state.doc.nodeAt(pos!)!.nodeSize);
    } finally {
      editor.destroy();
    }
  });

  it("inserts a second placeholder at an explicit position without retargeting the first one", () => {
    const editor = createEditor({
      type: "doc",
      content: [{ type: "paragraph" }],
    });

    try {
      const first = insertImagePlaceholderAtRange(editor, { from: 1, to: 1 });
      expect(first).not.toBeNull();

      const second = insertImagePlaceholderAtPos(editor, first!.nextPos);
      expect(second).not.toBeNull();

      const firstPos = resolveImageTargetPos(editor, first!.target);
      const secondPos = resolveImageTargetPos(editor, second!.target);

      expect(firstPos).toBe(0);
      expect(secondPos).toBeGreaterThan(firstPos!);
    } finally {
      editor.destroy();
    }
  });

  it("replaces the src for the targeted image node", () => {
    const editor = createEditor({
      type: "doc",
      content: [{ type: "image", attrs: { src: "" } }],
    });

    try {
      const target: ImageNodeTarget = { pos: 0, dom: null };

      expect(replaceImageSourceAtTarget(editor, target, "/uploads/example")).toBe(true);
      const json = editor.getJSON() as {
        content?: Array<{ attrs?: { src?: string } }>;
      };
      expect(json.content?.[0]?.attrs?.src).toBe("/uploads/example");
    } finally {
      editor.destroy();
    }
  });

  it("fails closed when the target is no longer an image node", () => {
    const editor = createEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "hello" }],
        },
      ],
    });

    try {
      const target: ImageNodeTarget = { pos: 0, dom: null };

      expect(replaceImageSourceAtTarget(editor, target, "/uploads/example")).toBe(false);
      expect(editor.state.doc.firstChild?.type.name).toBe("paragraph");
    } finally {
      editor.destroy();
    }
  });

  it("does not treat unknown pending ids as active local uploads", () => {
    expect(getLocalImagePreview("stale-upload")).toBeNull();
  });

  it("rejects unsupported image files before creating local preview URLs", async () => {
    const editor = createEditor({
      type: "doc",
      content: [{ type: "image", attrs: { src: "" } }],
    });
    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL");

    try {
      const ok = await uploadAndReplaceImageAtTarget(
        editor,
        { workspaceId: "workspace-1", pageId: "page-1", shareToken: undefined },
        new File(["payload"], "vector.svg", { type: "image/svg+xml" }),
        { pos: 0, dom: null },
      );

      expect(ok).toBe(false);
      expect(toastMocks.error).toHaveBeenCalledWith("File type not allowed");
      expect(createObjectURLSpy).not.toHaveBeenCalled();
      expect(uploadFileMock).not.toHaveBeenCalled();
    } finally {
      editor.destroy();
    }
  });

  it("rejects oversized image files before creating local preview URLs", async () => {
    const editor = createEditor({
      type: "doc",
      content: [{ type: "image", attrs: { src: "" } }],
    });
    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL");

    try {
      const ok = await uploadAndReplaceImageAtTarget(
        editor,
        { workspaceId: "workspace-1", pageId: "page-1", shareToken: undefined },
        new File([new Uint8Array(MAX_UPLOAD_SIZE + 1)], "large.png", { type: "image/png" }),
        { pos: 0, dom: null },
      );

      expect(ok).toBe(false);
      expect(toastMocks.error).toHaveBeenCalledWith("File too large (max 10MB)");
      expect(createObjectURLSpy).not.toHaveBeenCalled();
      expect(uploadFileMock).not.toHaveBeenCalled();
    } finally {
      editor.destroy();
    }
  });

  it("does not create a preview or upload when the target image no longer exists", async () => {
    const editor = createEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "hello" }],
        },
      ],
    });
    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL");

    try {
      const ok = await uploadAndReplaceImageAtTarget(
        editor,
        { workspaceId: "workspace-1", pageId: "page-1", shareToken: undefined },
        new File(["payload"], "image.png", { type: "image/png" }),
        { pos: 0, dom: null },
      );

      expect(ok).toBe(false);
      expect(toastMocks.error).toHaveBeenCalledWith(IMAGE_TARGET_MISSING_MESSAGE);
      expect(createObjectURLSpy).not.toHaveBeenCalled();
      expect(uploadFileMock).not.toHaveBeenCalled();
    } finally {
      editor.destroy();
    }
  });

  it("clears local preview state and the pending marker after upload succeeds", async () => {
    const editor = createEditor(
      {
        type: "doc",
        content: [{ type: "image", attrs: { src: "" } }],
      },
      [StarterKit, ImageWithUploadAttrs],
    );
    let pendingDuringUpload: string | null = null;
    stubLoadedImage(640, 360);
    uploadFileMock.mockImplementation(async () => {
      const pendingInsertId = editor.state.doc.nodeAt(0)?.attrs.pendingInsertId;
      pendingDuringUpload = typeof pendingInsertId === "string" ? pendingInsertId : null;
      expect(pendingDuringUpload).not.toBeNull();
      expect(getLocalImagePreview(pendingDuringUpload)).not.toBeNull();
      return "/uploads/example";
    });

    try {
      const ok = await uploadAndReplaceImageAtTarget(
        editor,
        { workspaceId: "workspace-1", pageId: "page-1", shareToken: undefined },
        new File(["payload"], "image.png", { type: "image/png" }),
        { pos: 0, dom: null },
      );
      const attrs = editor.state.doc.nodeAt(0)?.attrs;

      expect(ok).toBe(true);
      expect(uploadFileMock).toHaveBeenCalledOnce();
      expect(attrs?.src).toBe("/uploads/example");
      expect(attrs?.pendingInsertId).toBeNull();
      expect(attrs?.naturalWidth).toBe(640);
      expect(attrs?.naturalHeight).toBe(360);
      expect(pendingDuringUpload).not.toBeNull();
      expect(getLocalImagePreview(pendingDuringUpload)).toBeNull();
    } finally {
      editor.destroy();
    }
  });
});
