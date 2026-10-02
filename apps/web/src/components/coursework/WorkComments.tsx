import type { ContentDocument } from "@faridalms/domain/content";
import type { CommentAnchor } from "@faridalms/domain/coursework";
import type { RefObject } from "react";

import { Popover } from "@base-ui/react/popover";
import { anchorOf, rangeOf, wordsIn } from "@faridalms/editor/anchors";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { cn } from "@faridalms/ui/cn";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, MessageSquarePlus, Pencil, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { ContentView } from "~/components/content/ContentView";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  commentOnWork,
  removeWorkComment,
  saveToCommentBank,
} from "~/server/coursework";
import { getMessageFromError } from "~/utils/error";

import { displayName } from "../people/format";
import { CommentBankPicker } from "./CommentBank";
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

/** Where an inline box stands: the passage's own box on screen. */
interface Spot {
  getBoundingClientRect: () => DOMRect;
  contextElement: Element;
}

/** What opens at a passage: its comment, or a comment being written. */
type Inline = (
  | { kind: "comment"; id: string }
  | { kind: "new"; passage: Passage }
  | { kind: "edit"; comment: WorkComment }
) & { spot: Spot };

const spotOf = (element: Element, range: Range): Spot => ({
  getBoundingClientRect: () => range.getBoundingClientRect(),
  contextElement: element,
});

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

function CommentMeta({ comment }: { comment: WorkComment }) {
  const user = useCurrentUser();
  return (
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
  );
}

function SmallCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => onChange(next)}
      />
      <label
        htmlFor={id}
        className="text-[13px] leading-[18px] text-muted-foreground"
      >
        {label}
      </label>
    </div>
  );
}

/** Writes a comment on a passage, or changes the grader's own. */
function Composer({
  attemptId,
  passage,
  comment,
  field,
  onDirty,
  onDone,
}: {
  attemptId: string;
  passage: Passage;
  comment?: WorkComment;
  field: RefObject<HTMLTextAreaElement | null>;
  onDirty: (dirty: boolean) => void;
  onDone: (id: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState(comment?.body ?? "");
  const [bank, setBank] = useState(false);
  const [keep, setKeep] = useState(false);
  const [share, setShare] = useState(false);
  const write = (next: string) => {
    setBody(next);
    onDirty(next.trim() !== (comment?.body ?? ""));
  };
  const save = useMutation({
    mutationFn: async () => {
      const saved = await commentOnWork({
        data: {
          id: comment?.id ?? "",
          attemptId,
          expectedVersion: comment?.version ?? 0,
          anchor: passage.anchor,
          body,
        },
      });
      if (keep)
        await saveToCommentBank({
          data: { id: "", expectedVersion: 0, body, shared: share },
        });
      return saved;
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["coursework"] });
      onDirty(false);
      onDone(saved.id);
    },
    onError: (failure) => toast.error(getMessageFromError(failure)),
  });
  const submit = () => {
    if (body.trim() && !save.isPending) save.mutate();
  };
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Textarea
        ref={field}
        aria-label={m.courseworkComment()}
        dir="auto"
        rows={3}
        maxLength={2000}
        placeholder={m.courseworkCommentPlaceholder()}
        className="field-sizing-content max-h-60 min-h-20 resize-none"
        value={body}
        onChange={(event) => {
          // "#" in an empty comment opens the bank, as in Classroom.
          if (event.target.value === "#") {
            setBank(true);
            return;
          }
          write(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            submit();
          }
        }}
      />
      {comment ? null : (
        <SmallCheck
          label={m.courseworkBankKeep()}
          checked={keep}
          onChange={setKeep}
        />
      )}
      {keep ? (
        <SmallCheck
          label={m.courseworkBankShare()}
          checked={share}
          onChange={setShare}
        />
      ) : null}
      <div className="flex items-center gap-1">
        <CommentBankPicker
          compact
          open={bank}
          onOpenChange={setBank}
          onPick={(picked) => {
            write(body.trim() ? `${body.trimEnd()} ${picked}` : picked);
            field.current?.focus();
          }}
        />
        <span className="flex-1" />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={save.isPending}
          onClick={() => {
            onDirty(false);
            onDone(null);
          }}
        >
          {m.commonCancel()}
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={save.isPending || !body.trim()}
        >
          {save.isPending ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : null}
          {m.courseworkCommentSave()}
        </Button>
      </div>
    </form>
  );
}

/**
 * Handed-in work with its comments marked on the passages they were made
 * on. A marked passage opens its comment where it stands; a grader who
 * selects a passage writes a comment on it there.
 */
export function CommentedWork({
  document: work,
  comments,
  active,
  reveal,
  attemptId,
  onOpen,
  onPassages,
}: {
  document: ContentDocument;
  comments: WorkComment[];
  active: string | null;
  /** Scrolls to the active comment and opens it each time it changes. */
  reveal?: number;
  /** The attempt a grader comments on; readers only read. */
  attemptId?: string;
  onOpen: (id: string | null) => void;
  /** Told the words each comment points at, as the work reads them. */
  onPassages?: (passages: Record<string, string>) => void;
}) {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const root = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const resolved = useRef<[string, Range][]>([]);
  const tell = useRef(onPassages);
  const told = useRef("");
  const dirty = useRef(false);
  const [offer, setOffer] = useState<
    (Passage & { top: number; left: number }) | null
  >(null);
  const [inline, setInline] = useState<Inline | null>(null);
  const handlers = useRef({ onOpen, attemptId });

  const draft =
    inline?.kind === "new"
      ? inline.passage.anchor
      : inline?.kind === "edit"
        ? inline.comment.anchor
        : null;

  useEffect(() => {
    const element = root.current;
    if (!element) return undefined;
    const key = Symbol("comments");
    resolved.current = comments.flatMap((comment): [string, Range][] => {
      const range = rangeOf(element, comment.anchor);
      return range ? [[comment.id, range]] : [];
    });
    const pending = draft ? rangeOf(element, draft) : null;
    painted.set(key, {
      all: resolved.current.map(([, range]) => range),
      active: [
        ...resolved.current
          .filter(([id]) => id === active)
          .map(([, range]) => range),
        ...(pending ? [pending] : []),
      ],
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
  }, [comments, active, draft]);

  useEffect(() => {
    tell.current = onPassages;
    handlers.current = { onOpen, attemptId };
  });

  useEffect(() => {
    if (!reveal || !active) return;
    const range = resolved.current.find(([id]) => id === active)?.[1];
    const element = root.current;
    if (!range || !element) return;
    range.startContainer.parentElement?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
    setInline({ kind: "comment", id: active, spot: spotOf(element, range) });
  }, [reveal, active]);

  useEffect(() => {
    if (!attemptId) return undefined;
    const onChange = () => {
      if (document.getSelection()?.isCollapsed ?? true) setOffer(null);
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, [attemptId]);

  // The work is read, not operated: these follow what the reader selects
  // and clicks in it, and the comment list is the way in from a keyboard.
  useEffect(() => {
    const element = root.current;
    if (!element) return undefined;
    const offerFor = () => {
      const selection = document.getSelection();
      if (!handlers.current.attemptId || !selection || selection.isCollapsed)
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
      if (!hit) return;
      handlers.current.onOpen(hit[0]);
      setInline({ kind: "comment", id: hit[0], spot: spotOf(element, hit[1]) });
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

  const shownId = inline?.kind === "comment" ? inline.id : null;
  const shown = shownId
    ? comments.find((comment) => comment.id === shownId)
    : undefined;
  const remove = useMutation({
    mutationFn: (comment: WorkComment) =>
      removeWorkComment({
        data: { id: comment.id, expectedVersion: comment.version },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["coursework"] });
      setInline(null);
      onOpen(null);
      toast.success(m.courseworkCommentRemoved());
    },
    onError: (failure) => toast.error(getMessageFromError(failure)),
  });

  const close = () => {
    dirty.current = false;
    setInline(null);
  };

  return (
    <div ref={root} className="relative">
      <ContentView document={work} fileUrl={(id) => `/files/${id}`} />
      {offer && attemptId ? (
        <Button
          type="button"
          size="sm"
          style={{ top: offer.top, left: offer.left }}
          className="absolute z-10 -translate-x-1/2 shadow-md"
          // Keeps the selection while the button takes the click.
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            const element = root.current;
            const range = element ? rangeOf(element, offer.anchor) : null;
            if (element && range)
              setInline({
                kind: "new",
                passage: { anchor: offer.anchor, words: offer.words },
                spot: spotOf(element, range),
              });
            setOffer(null);
            document.getSelection()?.removeAllRanges();
          }}
        >
          <MessageSquarePlus aria-hidden />
          {m.courseworkComment()}
        </Button>
      ) : null}
      <Popover.Root
        open={inline !== null}
        onOpenChange={(next, details) => {
          if (next) return;
          // A comment half written stays open when the reader clicks away.
          if (details.reason === "outside-press" && dirty.current) return;
          close();
        }}
      >
        <Popover.Portal>
          <Popover.Positioner
            anchor={inline?.spot}
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={16}
            className="z-40"
          >
            <Popover.Popup
              initialFocus={inline?.kind === "comment" ? true : field}
              className="w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg outline-none"
            >
              {inline && inline.kind !== "comment" && attemptId ? (
                <Composer
                  key={
                    inline.kind === "edit"
                      ? inline.comment.id
                      : JSON.stringify(inline.passage.anchor)
                  }
                  attemptId={attemptId}
                  passage={
                    inline.kind === "new"
                      ? inline.passage
                      : { anchor: inline.comment.anchor, words: "" }
                  }
                  comment={inline.kind === "edit" ? inline.comment : undefined}
                  field={field}
                  onDirty={(next) => {
                    dirty.current = next;
                  }}
                  onDone={(id) => {
                    close();
                    if (id) onOpen(id);
                  }}
                />
              ) : shown ? (
                <div className="grid gap-2">
                  <p
                    dir="auto"
                    className="text-sm leading-5 whitespace-pre-wrap"
                  >
                    {shown.body}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <CommentMeta comment={shown} />
                    {attemptId && shown.authorId === user.id ? (
                      <span className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={m.courseworkCommentEdit()}
                          onClick={() =>
                            inline &&
                            setInline({
                              kind: "edit",
                              comment: shown,
                              spot: inline.spot,
                            })
                          }
                        >
                          <Pencil aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={m.courseworkCommentRemove()}
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(shown)}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

/** The comments on one attempt, each under the passage it was made on. */
export function CommentList({
  comments,
  passages,
  active,
  onShow,
}: {
  comments: WorkComment[];
  passages: Record<string, string>;
  active: string | null;
  onShow: (id: string) => void;
}) {
  return (
    <ul className="grid gap-3">
      {comments.map((comment) => {
        const words = passages[comment.id];
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
            <CommentMeta comment={comment} />
          </li>
        );
      })}
    </ul>
  );
}
