import type { ContentDocument } from "@faridalms/domain/content";
import type { LexicalEditor } from "lexical";

import Editor from "@faridalms/editor/Editor";
import { largeDocument } from "@faridalms/editor/large-document";
import { act, render, waitFor } from "@testing-library/react";
import {
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  getNearestEditorFromDOMNode,
} from "lexical";
import { Profiler } from "react";
import { describe, expect, it, vi } from "vitest";

import { editorStrings } from "./strings";

const KEYS = 40;

// Lexical watches its root for changes it did not make. happy-dom's observer
// walks the whole subtree each time Lexical stops and starts watching, around
// every update, which a browser does not; what is measured here is the
// editor's own work.
class QuietObserver {
  observe() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
vi.stubGlobal("MutationObserver", QuietObserver);

interface Mounted {
  editor: LexicalEditor;
  onChange: ReturnType<typeof vi.fn<(value: ContentDocument) => void>>;
  commits: () => number;
}

async function mount(document: ContentDocument): Promise<Mounted> {
  const onChange = vi.fn<(value: ContentDocument) => void>();
  let commits = 0;
  const { container } = render(
    <Profiler
      id="editor"
      onRender={() => {
        commits += 1;
      }}
    >
      <Editor
        id="body"
        label="Body"
        value={document}
        onChange={onChange}
        strings={editorStrings()}
        variant="document"
      />
    </Profiler>,
  );
  const editor = await waitFor(() => {
    const root = container.querySelector("[contenteditable=true]");
    const found = root ? getNearestEditorFromDOMNode(root) : null;
    if (!found) throw new Error("not mounted yet");
    return found;
  });
  // Settle what mounting started before anything is counted.
  await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
  onChange.mockClear();
  return { editor, onChange, commits: () => commits };
}

/** The text in the middle of the document, with the caret at its end. */
function placeCaret(editor: LexicalEditor) {
  editor.update(
    () => {
      const blocks = $getRoot().getChildren();
      const paragraph = blocks
        .slice(Math.floor(blocks.length / 2))
        .find($isParagraphNode);
      const text = paragraph?.getLastDescendant();
      if ($isTextNode(text)) text.select();
    },
    { discrete: true },
  );
}

/** Types a letter at a time, as the browser hands them over, and times each. */
function type(editor: LexicalEditor, keys: number): number[] {
  const times: number[] = [];
  for (let key = 0; key < keys; key += 1) {
    const start = performance.now();
    editor.update(
      () => {
        const selection = $getSelection();
        if ($isRangeSelection(selection))
          selection.insertText(key % 6 === 5 ? " " : "a");
      },
      { discrete: true },
    );
    times.push(performance.now() - start);
  }
  return times;
}

const median = (values: number[]) =>
  values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

// A key pressed in a long document must cost what it costs in a short one:
// no plugin, transform or listener may walk the whole document on each key,
// and the host's page is not redrawn between a key and its letter.
describe("typing in a long document", () => {
  it("costs no more per key than in a short one", async () => {
    const short = await mount(largeDocument({ rounds: 1 }));
    placeCaret(short.editor);
    type(short.editor, KEYS);
    const shortKey = median(type(short.editor, KEYS));

    const long = await mount(largeDocument({ rounds: 14 }));
    placeCaret(long.editor);
    type(long.editor, KEYS);
    const longKey = median(type(long.editor, KEYS));

    expect(
      long.editor.getEditorState().read(() => $getRoot().getChildrenSize()),
    ).toBeGreaterThan(300);
    // Fourteen times the blocks; a walk of them on each key shows as several
    // times the cost.
    expect(longKey).toBeLessThan(Math.max(shortKey * 2.5, 1));
  });

  it("draws nothing in React and hands the host the words once typing pauses", async () => {
    const { editor, onChange, commits } = await mount(
      largeDocument({ rounds: 6 }),
    );
    placeCaret(editor);
    const before = commits();
    type(editor, KEYS);
    expect(commits() - before).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const typed = editor
      .getEditorState()
      .read(() => $getRoot().getTextContent());
    expect(typed).toContain("aaaaa aaaaa");
  });

  it("hands over a key typed after a pause in a task of its own", async () => {
    const { editor, onChange } = await mount(largeDocument({ rounds: 2 }));
    placeCaret(editor);
    type(editor, 1);
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    type(editor, 1);
    expect(onChange).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
  });
});
