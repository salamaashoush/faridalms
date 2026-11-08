import type { NodeKey } from "lexical";

import { anchorContains } from "@faridalms/domain/anchors";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $getSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  COMMAND_PRIORITY_NORMAL,
  createCommand,
  KEY_DOWN_COMMAND,
} from "lexical";
import { MessageSquarePlus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";

import type { Placement } from "../comments";
import type { EditorComments } from "../context";

import {
  $blockAnchor,
  $blockOrder,
  $caretPoint,
  $placeAnchors,
  $selectionAnchor,
  rangeOfPlacement,
} from "../comments";
import { useEditorEnvironment } from "../context";
import { shortcutLabel, ToolButton } from "../ui";

/** Starts a thread on a block as a whole, from the block's own menu. */
export const COMMENT_BLOCK_COMMAND = createCommand<NodeKey>(
  "COMMENT_BLOCK_COMMAND",
);

const SHORTCUT = "Mod+Alt+M";

const highlights = () =>
  typeof CSS !== "undefined" && "highlights" in CSS ? CSS.highlights : null;

const MARKED = "data-fe-commented";

/** Comment on the floating bar, for the words or the block selected. */
export function CommentTool() {
  const [editor] = useLexicalComposerContext();
  const { comments, strings } = useEditorEnvironment();
  if (!comments) return null;
  return (
    <ToolButton
      label={strings.comment}
      shortcut={shortcutLabel(SHORTCUT)}
      onClick={() => {
        const found = editor
          .getEditorState()
          .read(() => $selectionAnchor($getSelection()));
        if (found) comments.start(found.anchor, found.quote);
      }}
    >
      <MessageSquarePlus aria-hidden />
    </ToolButton>
  );
}

/**
 * Marks commented passages in the text without touching it: words through
 * the browser's highlights, a block commented as a whole by an attribute
 * on its element, neither of which the document saves. A click in a
 * marked passage opens its thread.
 */
export function CommentsPlugin() {
  const { comments } = useEditorEnvironment();
  return comments ? <CommentMarks comments={comments} /> : null;
}

function CommentMarks({ comments }: { comments: EditorComments }) {
  const [editor] = useLexicalComposerContext();
  const latest = useRef(comments);
  useLayoutEffect(() => {
    latest.current = comments;
  });
  const reported = useRef<string | null>(null);
  const placed = useRef<{ id: string; placement: Placement }[]>([]);
  const { threads, active } = comments;

  useEffect(() => {
    const registry = highlights();
    let marked: HTMLElement[] = [];
    let frame = 0;
    const draw = () => {
      frame = 0;
      const found = editor.getEditorState().read(() => $placeAnchors(threads));
      placed.current = found;
      const order = found.map((row) => row.id).join(",");
      if (order !== reported.current) {
        reported.current = order;
        latest.current.onPlaced(found.map((row) => row.id));
      }
      for (const element of marked) element.removeAttribute(MARKED);
      marked = [];
      const quiet: Range[] = [];
      const strong: Range[] = [];
      const settled = new Set(
        threads.filter((mark) => mark.resolved).map((mark) => mark.id),
      );
      for (const { id, placement } of found) {
        if (settled.has(id) && id !== active) continue;
        if (placement.kind === "block") {
          const element = editor.getElementByKey(placement.key);
          if (!element) continue;
          element.setAttribute(MARKED, id === active ? "active" : "");
          marked.push(element);
          continue;
        }
        const range = rangeOfPlacement(editor, placement);
        if (range) (id === active ? strong : quiet).push(range);
      }
      if (!registry) return;
      registry.set("fe-comment", new Highlight(...quiet));
      registry.set("fe-comment-active", new Highlight(...strong));
    };
    draw();
    // Without threads there is nothing to place, and moving the caret moves
    // no passage, so only a change to the words places them again.
    const stop =
      threads.length === 0
        ? () => {}
        : editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
            if (frame || (dirtyElements.size === 0 && dirtyLeaves.size === 0))
              return;
            frame = requestAnimationFrame(draw);
          });
    return () => {
      stop();
      cancelAnimationFrame(frame);
      for (const element of marked) element.removeAttribute(MARKED);
      registry?.delete("fe-comment");
      registry?.delete("fe-comment-active");
    };
  }, [editor, threads, active]);

  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          CLICK_COMMAND,
          () => {
            const point = $caretPoint($getSelection());
            if (!point) return false;
            const order = $blockOrder();
            const marks = latest.current.threads;
            const hit = placed.current
              .map((row) => marks.find((mark) => mark.id === row.id))
              .findLast(
                (mark) =>
                  mark &&
                  !mark.resolved &&
                  anchorContains(mark.anchor, point, order),
              );
            if (hit) latest.current.open(hit.id);
            return false;
          },
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(
          KEY_DOWN_COMMAND,
          (event) => {
            if (
              !(event.metaKey || event.ctrlKey) ||
              !event.altKey ||
              event.shiftKey ||
              event.code !== "KeyM"
            )
              return false;
            const found = $selectionAnchor($getSelection());
            if (!found) return false;
            event.preventDefault();
            latest.current.start(found.anchor, found.quote);
            return true;
          },
          COMMAND_PRIORITY_NORMAL,
        ),
        editor.registerCommand(
          COMMENT_BLOCK_COMMAND,
          (key) => {
            const found = $blockAnchor(key);
            if (found) latest.current.start(found.anchor, found.quote);
            return Boolean(found);
          },
          COMMAND_PRIORITY_LOW,
        ),
      ),
    [editor],
  );

  const reveal = comments.reveal;
  useEffect(() => {
    if (!reveal) return;
    const found = placed.current.find((row) => row.id === reveal.id);
    if (!found) return;
    const target =
      found.placement.kind === "block"
        ? editor.getElementByKey(found.placement.key)
        : rangeOfPlacement(editor, found.placement)?.startContainer
            .parentElement;
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [editor, reveal]);

  return null;
}
