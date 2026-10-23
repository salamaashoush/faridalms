import type { LexicalEditor } from "lexical";

import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { act, render } from "@testing-library/react";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
} from "lexical";
import { describe, expect, it } from "vitest";

import { DirectionPlugin } from "./plugins/Direction";

const lines =
  (...texts: string[]) =>
  () => {
    const root = $getRoot();
    root.clear();
    for (const text of texts) {
      const paragraph = $createParagraphNode();
      if (text) paragraph.append($createTextNode(text));
      root.append(paragraph);
    }
  };

function Capture({ onEditor }: { onEditor: (editor: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext();
  onEditor(editor);
  return null;
}

async function mount(...texts: string[]) {
  let editor: LexicalEditor | undefined;
  const view = render(
    <LexicalComposer
      initialConfig={{
        namespace: "direction",
        onError: (error) => {
          throw error;
        },
        editorState: lines(...texts),
      }}
    >
      <div>
        <RichTextPlugin
          contentEditable={<ContentEditable aria-label="Text" />}
          ErrorBoundary={LexicalErrorBoundary}
        />
      </div>
      <DirectionPlugin />
      <Capture onEditor={(found) => (editor = found)} />
    </LexicalComposer>,
  );
  await act(async () => {});
  if (!editor) throw new Error("no editor");
  const paragraphs = () => [...view.container.querySelectorAll("p")];
  return { editor, paragraphs };
}

const dirs = (paragraphs: HTMLElement[]) =>
  paragraphs.map((paragraph) => paragraph.getAttribute("dir"));

describe("a document's direction", () => {
  it("points lines without letters its own way, and only until they hold some", async () => {
    const { editor, paragraphs } = await mount("مرحبا بكم", "", "42");
    expect(dirs(paragraphs())).toEqual(["auto", "rtl", "rtl"]);

    await act(async () => {
      editor.update(() => {
        const empty = $getRoot().getChildAtIndex(1);
        if ($isElementNode(empty)) empty.append($createTextNode("سلام"));
      });
    });
    expect(dirs(paragraphs())).toEqual(["auto", "auto", "rtl"]);
    expect(paragraphs()[1]?.hasAttribute("data-neutral-dir")).toBe(false);
  });

  it("settles every line again when the whole document is replaced", async () => {
    const { editor, paragraphs } = await mount("مرحبا بكم", "سلام");
    expect(dirs(paragraphs())).toEqual(["auto", "auto"]);

    const emptied = editor.parseEditorState(
      JSON.stringify(editor.getEditorState().toJSON()).replace("سلام", ""),
    );
    await act(async () => {
      editor.setEditorState(emptied);
    });
    expect(dirs(paragraphs())).toEqual(["auto", "rtl"]);
  });
});
