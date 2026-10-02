import type { ContentDocument } from "@faridalms/domain/content";
import type { CommentAnchor } from "@faridalms/domain/coursework";

import { anchorOf, rangeOf, wordsIn } from "@faridalms/editor/anchors";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { MessageSquarePlus, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ContentView } from "~/components/content/ContentView";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";

import { displayName } from "../people/format";
import { formatInstant } from "./format";

export interface WorkComment {
  id: string;
  version: number;
  authorId: string;
  authorNameEn: string | null;
  authorNameAr: string | null;
  anchor: CommentAnchor;
  body: string;
  createdAt: string;
  editedAt: string | null;
}

export interface Passage {
  anchor: CommentAnchor;
  words: string;
}

// Every commented work on the page paints into the same two highlights, so
// each keeps its ranges here and the highlights are rebuilt from all of them.
const painted = new Map<symbol, { all: Range[]; active: Range[] }>();

function paint() {
  // Browsers before the Custom Highlight API show comments in the list only.
  const registry = (CSS as { highlights?: HighlightRegistry }).highlights;
  if (!registry) return;
  const all = [...painted.values()].flatMap((entry) => entry.all);
  const active = [...painted.values()].flatMap((entry) => entry.active);
  registry.set("fe-comment", new Highlight(...all));
  registry.set("fe-comment-active", new Highlight(...active));
}

// Safari has only the older of the two.
const caretSource: Partial<
  Pick<Document, "caretPositionFromPoint" | "caretRangeFromPoint">
> = typeof document === "undefined" ? {} : document;

function caretAt(x: number, y: number): [Node, number] | null {
  if (caretSource.caretPositionFromPoint) {
    const position = caretSource.caretPositionFromPoint.call(document, x, y);
    return position ? [position.offsetNode, position.offset] : null;
  }
  const range = caretSource.caretRangeFromPoint?.call(document, x, y);
  return range ? [range.startContainer, range.startOffset] : null;
}

/**
 * Handed-in work with its comments marked on the passages they were made
 * on. A click on a marked passage opens its comment; a grader who selects a
 * passage is offered a comment on it.
 */
export function CommentedWork({
  document: work,
  comments,
  active,
  reveal,
  onOpen,
  onPassages,
  onComment,
}: {
  document: ContentDocument;
  comments: WorkComment[];
  active: string | null;
  /** Scrolls the active comment's passage into view each time it changes. */
  reveal?: number;
  onOpen: (id: string) => void;
  /** Told the words each comment points at, as the work reads them. */
  onPassages?: (passages: Record<string, string>) => void;
  onComment?: (passage: Passage) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const resolved = useRef<[string, Range][]>([]);
  const tell = useRef(onPassages);
  const told = useRef("");
  const [offer, setOffer] = useState<
    (Passage & { top: number; left: number }) | null
  >(null);
  const handlers = useRef({ onOpen, onComment });

  useEffect(() => {
    const element = root.current;
    if (!element) return undefined;
    const key = Symbol("comments");
    resolved.current = comments.flatMap((comment): [string, Range][] => {
      const range = rangeOf(element, comment.anchor);
      return range ? [[comment.id, range]] : [];
    });
    painted.set(key, {
      all: resolved.current.map(([, range]) => range),
      active: resolved.current
        .filter(([id]) => id === active)
        .map(([, range]) => range),
    });
    paint();
    const passages = Object.fromEntries(
      resolved.current.map(([id, range]) => [id, wordsIn(element, range)]),
    );
    const text = JSON.stringify(passages);
    if (text !== told.current) {
      told.current = text;
      tell.current?.(passages);
    }
    return () => {
      painted.delete(key);
      paint();
    };
  }, [comments, active]);

  useEffect(() => {
    tell.current = onPassages;
    handlers.current = { onOpen, onComment };
  });

  useEffect(() => {
    if (!reveal) return;
    const range = resolved.current.find(([id]) => id === active)?.[1];
    range?.startContainer.parentElement?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [reveal, active]);

  useEffect(() => {
    if (!onComment) return undefined;
    const onChange = () => {
      if (document.getSelection()?.isCollapsed ?? true) setOffer(null);
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, [onComment]);

  // The work is read, not operated: these follow what the reader selects
  // and clicks in it, and the comment list is the way in from a keyboard.
  useEffect(() => {
    const element = root.current;
    if (!element) return undefined;
    const offerFor = () => {
      const selection = document.getSelection();
      if (!handlers.current.onComment || !selection || selection.isCollapsed)
        return;
      const range = selection.getRangeAt(0);
      if (!element.contains(range.commonAncestorContainer)) return;
      const anchor = anchorOf(element, range);
      if (!anchor) return;
      const box = element.getBoundingClientRect();
      const rect = range.getBoundingClientRect();
      setOffer({
        anchor,
        words: wordsIn(element, range),
        top: rect.bottom - box.top + 8,
        left: Math.min(
          Math.max(rect.left - box.left + rect.width / 2, 64),
          box.width - 64,
        ),
      });
    };
    const openAt = (event: MouseEvent) => {
      if (!(document.getSelection()?.isCollapsed ?? true)) return;
      const caret = caretAt(event.clientX, event.clientY);
      if (!caret) return;
      const hit = resolved.current.find(([, range]) =>
        range.isPointInRange(...caret),
      );
      if (hit) handlers.current.onOpen(hit[0]);
    };
    element.addEventListener("pointerup", offerFor);
    element.addEventListener("keyup", offerFor);
    element.addEventListener("click", openAt);
    return () => {
      element.removeEventListener("pointerup", offerFor);
      element.removeEventListener("keyup", offerFor);
      element.removeEventListener("click", openAt);
    };
  }, []);

  return (
    <div ref={root} className="relative">
      <ContentView document={work} fileUrl={(id) => `/files/${id}`} />
      {offer ? (
        <Button
          type="button"
          size="sm"
          style={{ top: offer.top, left: offer.left }}
          className="absolute z-10 -translate-x-1/2 shadow-md"
          // Keeps the selection while the button takes the click.
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            onComment?.({ anchor: offer.anchor, words: offer.words });
            setOffer(null);
            document.getSelection()?.removeAllRanges();
          }}
        >
          <MessageSquarePlus aria-hidden />
          {m.courseworkComment()}
        </Button>
      ) : null}
    </div>
  );
}

/** The comments on one attempt, each under the passage it was made on. */
export function CommentList({
  comments,
  passages,
  active,
  onShow,
  onEdit,
  onRemove,
}: {
  comments: WorkComment[];
  passages: Record<string, string>;
  active: string | null;
  onShow: (id: string) => void;
  /** Offered on the viewer's own comments only. */
  onEdit?: (comment: WorkComment) => void;
  onRemove?: (comment: WorkComment) => void;
}) {
  const user = useCurrentUser();
  return (
    <ul className="grid gap-3">
      {comments.map((comment) => {
        const words = passages[comment.id];
        const own = comment.authorId === user.id;
        return (
          <li
            key={comment.id}
            id={`comment-${comment.id}`}
            className={cn(
              "grid gap-2 rounded-lg border p-3",
              comment.id === active &&
                "border-amber-400 bg-amber-50/60 dark:bg-amber-400/10",
            )}
          >
            {words ? (
              <button
                type="button"
                aria-label={m.courseworkCommentShow()}
                onClick={() => onShow(comment.id)}
                className="line-clamp-2 border-s-2 border-amber-400 ps-2 text-start text-[13px] leading-[18px] text-muted-foreground hover:text-foreground"
              >
                <bdi>{words}</bdi>
              </button>
            ) : (
              <p className="text-[13px] leading-[18px] text-muted-foreground">
                {m.courseworkCommentMissing()}
              </p>
            )}
            <p dir="auto" className="text-sm leading-5 whitespace-pre-wrap">
              {comment.body}
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] leading-[18px] text-muted-foreground">
                {[
                  displayName({
                    fullNameEn: comment.authorNameEn,
                    fullNameAr: comment.authorNameAr,
                  }),
                  formatInstant(comment.createdAt, user.school.timeZone),
                  comment.editedAt ? m.courseworkCommentEdited() : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {own && (onEdit || onRemove) ? (
                <span className="flex shrink-0 gap-1">
                  {onEdit ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={m.courseworkCommentEdit()}
                      onClick={() => onEdit(comment)}
                    >
                      <Pencil aria-hidden />
                    </Button>
                  ) : null}
                  {onRemove ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={m.courseworkCommentRemove()}
                      onClick={() => onRemove(comment)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  ) : null}
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
