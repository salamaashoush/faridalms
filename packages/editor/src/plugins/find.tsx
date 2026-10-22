import type { LexicalEditor, NodeKey, TextNode } from "lexical";

import { Popover } from "@base-ui/react/popover";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $dfs } from "@lexical/utils";
import {
  $addUpdateTag,
  $createRangeSelection,
  $isTextNode,
  $setSelection,
  SKIP_DOM_SELECTION_TAG,
} from "lexical";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useEditorEnvironment } from "../context";
import { findIn } from "../find";
import { Tip } from "../ui";

interface Point {
  key: NodeKey;
  offset: number;
}

/** A match in the document, from where it starts to where it ends. */
export interface Found {
  anchor: Point;
  focus: Point;
}

/**
 * Every match in the document, in reading order. Text is searched a run at
 * a time, the neighbouring pieces of one line read together, so a word half
 * in bold is still found.
 */
export function $findInDocument(query: string, matchCase: boolean): Found[] {
  const runs: TextNode[][] = [];
  for (const { node } of $dfs()) {
    if (!$isTextNode(node)) continue;
    const run = runs.at(-1);
    const previous = node.getPreviousSibling();
    if (run && previous && run.at(-1)?.is(previous)) run.push(node);
    else runs.push([node]);
  }
  const found: Found[] = [];
  for (const run of runs) {
    const starts: number[] = [];
    let text = "";
    for (const node of run) {
      starts.push(text.length);
      text += node.getTextContent();
    }
    /**
     * The node and offset where a place in the run's text falls; an end on
     * the edge between two pieces belongs to the piece before it.
     */
    const pointAt = (at: number, end: boolean): Point => {
      const index = Math.max(
        0,
        starts.findLastIndex((start) => (end ? start < at : start <= at)),
      );
      return {
        key: run[index]?.getKey() ?? "",
        offset: at - (starts[index] ?? 0),
      };
    };
    for (const { start, end } of findIn(text, query, matchCase))
      found.push({ anchor: pointAt(start, false), focus: pointAt(end, true) });
  }
  return found;
}

/** A match as a range of the page's own text, for the browser to highlight. */
function rangeOf(editor: LexicalEditor, match: Found): Range | null {
  const start = editor.getElementByKey(match.anchor.key)?.firstChild;
  const end = editor.getElementByKey(match.focus.key)?.firstChild;
  if (!start || !end) return null;
  const range = document.createRange();
  try {
    range.setStart(start, match.anchor.offset);
    range.setEnd(end, match.focus.offset);
  } catch {
    // The text changed under the match; the next search draws it again.
    return null;
  }
  return range;
}

function $select(match: Found) {
  const selection = $createRangeSelection();
  selection.anchor.set(match.anchor.key, match.anchor.offset, "text");
  selection.focus.set(match.focus.key, match.focus.offset, "text");
  $setSelection(selection);
  return selection;
}

/** Puts new words in place of matches, from the last so each before it is still where it was found. */
export function $replaceFound(found: readonly Found[], replacement: string) {
  for (const match of found.toReversed())
    $select(match).insertText(replacement);
}

const highlights = () =>
  typeof CSS !== "undefined" && "highlights" in CSS ? CSS.highlights : null;

/**
 * Finds words in the document and replaces them, the matches highlighted
 * in place without touching the text, the one in hand scrolled into view.
 * Enter goes to the next match and Shift and Enter back; closing selects
 * the match in hand in the text.
 */
export function FindTool({
  open,
  onOpenChange: setOpen,
  anchor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where the panel opens from when its own button is in the More menu. */
  anchor?: HTMLElement | null;
}) {
  const [editor] = useLexicalComposerContext();
  const { strings } = useEditorEnvironment();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [matches, setMatches] = useState<Found[]>([]);
  const [current, setCurrent] = useState(0);
  const at = matches.length > 0 ? Math.min(current, matches.length - 1) : -1;
  const editable = editor.isEditable();

  useEffect(() => {
    if (!open) return undefined;
    const search = () =>
      setMatches(
        editor.getEditorState().read(() => $findInDocument(query, matchCase)),
      );
    search();
    return editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
      if (dirtyElements.size > 0 || dirtyLeaves.size > 0) search();
    });
  }, [editor, open, query, matchCase]);

  useEffect(() => {
    const registry = highlights();
    if (!open || !registry) return undefined;
    const ranges = matches.map((match) => rangeOf(editor, match));
    registry.set(
      "fe-find",
      new Highlight(
        ...ranges.filter(
          (range, index): range is Range => range !== null && index !== at,
        ),
      ),
    );
    const here = ranges[at];
    if (here) {
      registry.set("fe-find-current", new Highlight(here));
      here.startContainer.parentElement?.scrollIntoView({ block: "nearest" });
    } else registry.delete("fe-find-current");
    return () => {
      registry.delete("fe-find");
      registry.delete("fe-find-current");
    };
  }, [editor, open, matches, at]);

  const step = (by: number) => {
    if (matches.length > 0)
      setCurrent((at + by + matches.length) % matches.length);
  };
  const replaceOne = () => {
    const match = matches[at];
    if (!match) return;
    editor.update(() => {
      // The words change where they are; the caret stays in this panel.
      $addUpdateTag(SKIP_DOM_SELECTION_TAG);
      $replaceFound([match], replacement);
    });
  };
  const replaceAll = () => {
    editor.update(() => {
      $addUpdateTag(SKIP_DOM_SELECTION_TAG);
      $replaceFound(matches, replacement);
    });
  };
  const close = (next: boolean) => {
    setOpen(next);
    if (next) return;
    const match = matches[at];
    if (match) editor.update(() => void $select(match));
  };

  return (
    <Popover.Root open={open} onOpenChange={close} modal={false}>
      {anchor === undefined ? (
        <Tip label={strings.findReplace}>
          <Popover.Trigger
            aria-label={strings.findReplace}
            className="inline-flex size-8 items-center justify-center rounded-md text-foreground/80 hover:bg-accent hover:text-foreground [&_svg]:size-4"
          >
            <Search aria-hidden />
          </Popover.Trigger>
        </Tip>
      ) : null}
      <Popover.Portal>
        <Popover.Positioner
          className="z-50"
          sideOffset={6}
          align="end"
          anchor={anchor}
        >
          <Popover.Popup
            data-editor-prompt=""
            initialFocus={input}
            className="grid w-80 max-w-[calc(100vw-1rem)] gap-2 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg outline-none"
          >
            <div className="flex items-center justify-between gap-2">
              <Popover.Title className="text-sm font-semibold">
                {strings.findReplace}
              </Popover.Title>
              <Popover.Close
                aria-label={strings.narrationClose}
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground max-md:size-10 [&_svg]:size-4"
              >
                <X aria-hidden />
              </Popover.Close>
            </div>
            <div className="flex items-center gap-1">
              <input
                ref={input}
                type="search"
                dir="auto"
                value={query}
                aria-label={strings.findLabel}
                placeholder={strings.findLabel}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setCurrent(0);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  step(event.shiftKey ? -1 : 1);
                }}
                className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30 max-md:h-10"
              />
              <button
                type="button"
                aria-label={strings.findPrevious}
                disabled={matches.length === 0}
                onClick={() => step(-1)}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-foreground/80 hover:bg-accent disabled:opacity-50 max-md:size-10 [&_svg]:size-4"
              >
                <ChevronUp aria-hidden />
              </button>
              <button
                type="button"
                aria-label={strings.findNext}
                disabled={matches.length === 0}
                onClick={() => step(1)}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-foreground/80 hover:bg-accent disabled:opacity-50 max-md:size-10 [&_svg]:size-4"
              >
                <ChevronDown aria-hidden />
              </button>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <label className="flex items-center gap-1.5 text-muted-foreground">
                <input
                  type="checkbox"
                  checked={matchCase}
                  onChange={() => setMatchCase(!matchCase)}
                  className="size-4 accent-primary"
                />
                {strings.findMatchCase}
              </label>
              <output aria-live="polite" className="text-muted-foreground">
                {query
                  ? matches.length > 0
                    ? strings.findCount(at + 1, matches.length)
                    : strings.findNone
                  : null}
              </output>
            </div>
            {editable ? (
              <div className="grid gap-1.5 border-t pt-2">
                <input
                  type="text"
                  dir="auto"
                  value={replacement}
                  aria-label={strings.replaceLabel}
                  placeholder={strings.replaceLabel}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    replaceOne();
                  }}
                  onChange={(event) => setReplacement(event.target.value)}
                  className="h-8 min-w-0 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30 max-md:h-10"
                />
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    disabled={at < 0}
                    onClick={replaceOne}
                    className="inline-flex h-8 items-center rounded-md px-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50 max-md:h-10"
                  >
                    {strings.replaceOne}
                  </button>
                  <button
                    type="button"
                    disabled={at < 0}
                    onClick={replaceAll}
                    className="inline-flex h-8 items-center rounded-md bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 max-md:h-10"
                  >
                    {strings.replaceAll}
                  </button>
                </div>
              </div>
            ) : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
