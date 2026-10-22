import type { ContentDocument } from "@faridalms/domain/content";

import { $getRoot } from "lexical";
import { describe, expect, it } from "vitest";

import { buildContentEditor } from "./headless";
import { $isSharedNode } from "./nodes";
import { $sharableBlock } from "./plugins/shared";

const id = "0190a1b2-0000-7000-8000-0000000000aa";

const document: ContentDocument = {
  root: {
    type: "root",
    version: 1,
    children: [
      {
        type: "paragraph",
        version: 1,
        children: [{ type: "text", version: 1, text: "Before.", format: 0 }],
      },
      { type: "shared", version: 1, sharedId: id },
    ],
  },
};

describe("a shared block in a document", () => {
  it("is held by which one it is, and comes back the same", () => {
    const editor = buildContentEditor();
    editor.setEditorState(editor.parseEditorState(JSON.stringify(document)));
    const [paragraph, shared] = editor
      .getEditorState()
      .read(() => $getRoot().getChildren());
    expect(editor.getEditorState().read(() => $isSharedNode(shared))).toBe(
      true,
    );
    expect(
      (
        editor.getEditorState().toJSON().root.children[1] as {
          sharedId?: string;
        }
      ).sharedId,
    ).toBe(id);
    // Words at the top may be kept as one; a shared block may not be kept again.
    expect(
      editor
        .getEditorState()
        .read(() =>
          [paragraph, shared].map((node) =>
            node ? $sharableBlock(node) : null,
          ),
        ),
    ).toEqual([true, false]);
  });
});
