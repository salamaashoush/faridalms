import type { ContentDocument } from "@faridalms/domain/content";
import type { CommentAnchor, CommentKind } from "@faridalms/domain/coursework";
import type { RefObject } from "react";

import { Popover } from "@base-ui/react/popover";
import { COMMENT_KINDS } from "@faridalms/domain/coursework";
import { anchorOf, rangeOf, wordsIn } from "@faridalms/editor/anchors";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { cn } from "@faridalms/ui/cn";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookmarkPlus,
  LoaderCircle,
  MessageSquarePlus,
  Pencil,
  Trash2,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { ContentView } from "~/components/content/ContentView";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { commentBankQuery } from "~/queries/coursework";
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
  kind: CommentKind | null;
  criterionId: string | null;
  createdAt: string;
  editedAt: string | null;
}

export interface Criterion {
  id: string;
  title: string;
}

const KIND_LABEL: Record<CommentKind, () => string> = {
  fix: m.courseworkKindFix,
  think: m.courseworkKindThink,
  next: m.courseworkKindNext,
};

const KIND_TONE: Record<CommentKind, string> = {
  fix: "bg-red-500/10 text-red-700 dark:text-red-300",
  think: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  next: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

/** What a comment asks of the student and the criterion it is about. */
function CommentTags({
  comment,
  criteria,
}: {
  comment: WorkComment;
  criteria?: Criterion[];
}) {
  const criterion = criteria?.find((row) => row.id === comment.criterionId);
  if (!comment.kind && !criterion) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {comment.kind ? (
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-xs leading-4 font-medium",
            KIND_TONE[comment.kind],
          )}
        >
          {KIND_LABEL[comment.kind]()}
        </span>
      ) : null}
      {criterion ? (
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs leading-4 text-muted-foreground">
          <bdi>{criterion.title}</bdi>
        </span>
      ) : null}
    </div>
  );
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
type Inline =
  /** Every comment on the place clicked, as passages may overlap. */
  (
    | { kind: "comment"; ids: string[] }
    | { kind: "new"; passage: Passage }
    | { kind: "edit"; comment: WorkComment }
  ) & { spot: Spot };

// Marks are drawn again as comments change, so a box finds its passage's
// mark each time it is placed, and keeps the last place if the mark is gone.
const spotAt = (element: Element, selector: string, last: DOMRect): Spot => ({
  getBoundingClientRect: () =>
    element.querySelector(selector)?.getBoundingClientRect() ?? last,
  contextElement: element,
});
const markOf = (id: string) => `mark[data-comments~="${CSS.escape(id)}"]`;
const DRAFT = "mark[data-draft]";

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
  criteria,
  field,
  onDirty,
  onDone,
}: {
  attemptId: string;
  passage: Passage;
  comment?: WorkComment;
  criteria?: Criterion[];
  field: RefObject<HTMLTextAreaElement | null>;
  onDirty: (dirty: boolean) => void;
  onDone: (id: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState(comment?.body ?? "");
  const [kind, setKind] = useState<CommentKind | "">(comment?.kind ?? "");
  const [criterionId, setCriterionId] = useState(comment?.criterionId ?? "");
  const [bank, setBank] = useState(false);
  const [keep, setKeep] = useState(false);
  const [share, setShare] = useState(false);
  const write = (next: string) => {
    setBody(next);
    onDirty(next.trim() !== (comment?.body ?? ""));
  };
  const [bankId, setBankId] = useState("");
  const kept = useQuery({ ...commentBankQuery, enabled: !comment }).data;
  // Three letters in, the bank offers what matches, as Canvas's library does.
  const typed = body.trim().toLocaleLowerCase();
  const suggested =
    !comment && !bankId && typed.length >= 3
      ? (kept ?? [])
          .filter(
            (row) =>
              row.body.toLocaleLowerCase().includes(typed) &&
              row.body.toLocaleLowerCase() !== typed,
          )
          .slice(0, 3)
      : [];
  const pick = (row: { id: string; body: string }) => {
    write(row.body);
    setBankId(row.id);
    field.current?.focus();
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
          bankId,
          kind,
          criterionId,
        },
      });
      if (keep && !bankId)
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
      {suggested.length ? (
        <div className="grid gap-1">
          <p className="text-xs text-muted-foreground">
            {m.courseworkBankFromBank()}
          </p>
          {suggested.map((row) => (
            <button
              key={row.id}
              type="button"
              dir="auto"
              onClick={() => pick(row)}
              className="-mx-2 line-clamp-2 rounded-md px-2 py-1 text-start text-[13px] leading-[18px] outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {row.body}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <fieldset className="flex flex-wrap gap-1">
          <legend className="sr-only">{m.courseworkCommentKind()}</legend>
          {COMMENT_KINDS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={kind === option}
              onClick={() => setKind(kind === option ? "" : option)}
              className={cn(
                "rounded px-1.5 py-0.5 text-xs leading-4 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50 max-md:py-1.5",
                kind === option
                  ? KIND_TONE[option]
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {KIND_LABEL[option]()}
            </button>
          ))}
        </fieldset>
        {criteria?.length ? (
          <select
            aria-label={m.courseworkCommentCriterion()}
            value={criterionId}
            onChange={(event) => setCriterionId(event.target.value)}
            className="h-7 max-w-40 rounded-md border bg-background px-1.5 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <option value="">{m.courseworkCommentNoCriterion()}</option>
            {criteria.map((row) => (
              <option key={row.id} value={row.id}>
                {row.title}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      {comment || bankId ? null : (
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
          onPick={(picked) =>
            body.trim()
              ? write(`${body.trimEnd()} ${picked.body}`)
              : pick(picked)
          }
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
  criteria,
  onOpen,
  onPassages,
}: {
  document: ContentDocument;
  comments: WorkComment[];
  criteria?: Criterion[];
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
  const tell = useRef(onPassages);
  const told = useRef("");
  const dirty = useRef(false);
  const [offer, setOffer] = useState<
    (Passage & { top: number; left: number }) | null
  >(null);
  const [inline, setInline] = useState<Inline | null>(null);
  const handlers = useRef({ onOpen, attemptId });

  const marks = [
    ...comments.map((comment) => ({ id: comment.id, ...comment.anchor })),
    ...(inline?.kind === "new"
      ? [{ id: "draft", ...inline.passage.anchor, draft: true }]
      : []),
  ];
  const activeMark = inline?.kind === "edit" ? inline.comment.id : active;

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const passages = Object.fromEntries(
      comments.flatMap((comment) => {
        const range = rangeOf(element, comment.anchor);
        return range ? [[comment.id, wordsIn(element, range)]] : [];
      }),
    );
    const text = JSON.stringify(passages);
    if (text !== told.current) {
      told.current = text;
      tell.current?.(passages);
    }
  }, [comments]);

  useEffect(() => {
    tell.current = onPassages;
    handlers.current = { onOpen, attemptId };
  });

  useEffect(() => {
    if (!reveal || !active) return;
    const element = root.current;
    const mark = element?.querySelector(markOf(active));
    if (!element || !mark) return;
    mark.scrollIntoView({ block: "center", behavior: "smooth" });
    setInline({
      kind: "comment",
      ids: [active],
      spot: spotAt(element, markOf(active), mark.getBoundingClientRect()),
    });
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
      const mark =
        event.target instanceof Element
          ? event.target.closest("mark[data-comments]")
          : null;
      const ids = mark?.getAttribute("data-comments")?.split(" ") ?? [];
      const [first] = ids;
      if (!mark || !first || !element.contains(mark)) return;
      handlers.current.onOpen(first);
      setInline({
        kind: "comment",
        ids,
        spot: spotAt(element, markOf(first), mark.getBoundingClientRect()),
      });
    };
    // Ctrl or Cmd with Alt and M comments on the selection, as in Google Docs.
    const shortcut = (event: KeyboardEvent) => {
      if (
        !handlers.current.attemptId ||
        !(event.ctrlKey || event.metaKey) ||
        !event.altKey ||
        event.code !== "KeyM"
      )
        return;
      const selection = document.getSelection();
      if (!selection || selection.isCollapsed) return;
      const range = selection.getRangeAt(0);
      if (!element.contains(range.commonAncestorContainer)) return;
      const anchor = anchorOf(element, range);
      if (!anchor) return;
      event.preventDefault();
      setInline({
        kind: "new",
        passage: { anchor, words: wordsIn(element, range) },
        spot: spotAt(element, DRAFT, range.getBoundingClientRect()),
      });
      setOffer(null);
      selection.removeAllRanges();
    };
    element.addEventListener("pointerup", offerFor);
    element.addEventListener("keyup", offerFor);
    element.addEventListener("click", openAt);
    document.addEventListener("keydown", shortcut);
    return () => {
      element.removeEventListener("pointerup", offerFor);
      element.removeEventListener("keyup", offerFor);
      element.removeEventListener("click", openAt);
      document.removeEventListener("keydown", shortcut);
    };
  }, []);

  const shown =
    inline?.kind === "comment"
      ? comments.filter((comment) => inline.ids.includes(comment.id))
      : [];
  const bank = useQuery({
    ...commentBankQuery,
    enabled: Boolean(attemptId) && shown.length > 0,
  }).data;
  const keep = useMutation({
    mutationFn: (body: string) =>
      saveToCommentBank({
        data: { id: "", expectedVersion: 0, body, shared: false },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: commentBankQuery.queryKey,
      });
      toast.success(m.courseworkBankKept());
    },
    onError: (failure) => toast.error(getMessageFromError(failure)),
  });
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
      <ContentView
        document={work}
        fileUrl={(id) => `/files/${id}`}
        marks={marks}
        activeMark={activeMark}
      />
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
                spot: spotAt(element, DRAFT, range.getBoundingClientRect()),
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
                  criteria={criteria}
                  field={field}
                  onDirty={(next) => {
                    dirty.current = next;
                  }}
                  onDone={(id) => {
                    close();
                    if (id) onOpen(id);
                  }}
                />
              ) : shown.length ? (
                <ul className="grid gap-3 divide-y">
                  {shown.map((comment) => (
                    <li key={comment.id} className="grid gap-2 pb-3 last:pb-0">
                      <CommentTags comment={comment} criteria={criteria} />
                      <p
                        dir="auto"
                        className="text-sm leading-5 whitespace-pre-wrap"
                      >
                        {comment.body}
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <CommentMeta comment={comment} />
                        {attemptId && comment.authorId === user.id ? (
                          <span className="flex shrink-0 gap-1">
                            {bank &&
                            !bank.some((row) => row.body === comment.body) ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={m.courseworkBankKeep()}
                                title={m.courseworkBankKeep()}
                                disabled={keep.isPending}
                                onClick={() => keep.mutate(comment.body)}
                              >
                                <BookmarkPlus aria-hidden />
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={m.courseworkCommentEdit()}
                              onClick={() =>
                                inline &&
                                root.current &&
                                setInline({
                                  kind: "edit",
                                  comment,
                                  spot: spotAt(
                                    root.current,
                                    markOf(comment.id),
                                    inline.spot.getBoundingClientRect(),
                                  ),
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
                              onClick={() => remove.mutate(comment)}
                            >
                              <Trash2 aria-hidden />
                            </Button>
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
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
  criteria,
  passages,
  active,
  onShow,
}: {
  comments: WorkComment[];
  criteria?: Criterion[];
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
                aria-label={m.courseworkCommentShow({ passage: words })}
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
            <CommentTags comment={comment} criteria={criteria} />
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
