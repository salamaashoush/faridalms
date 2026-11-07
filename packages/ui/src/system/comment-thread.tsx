import type { KeyboardEvent, ReactNode } from "react";

import type { ActionItem } from "./action-menu";

import { Button } from "../button";
import { cn } from "../cn";
import { Check, LoaderCircle, RotateCcw, Unlink } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { ActionMenu } from "./action-menu";

/** One comment in a thread, already written out for the reader. */
export interface CommentEntry {
  id: string;
  author: string;
  /** When, as the reader reads it. */
  when: string;
  /** When, as an ISO instant, for the `time` element. */
  at: string;
  body: string;
  edited?: boolean;
  /** What the reader may do with it, such as edit or delete their own. */
  actions?: ActionItem[];
  /** Drawn in place of the body while the reader changes it. */
  editing?: ReactNode;
}

/** The words a thread says, in the app's language. */
export interface CommentThreadLabels {
  /** Names the thread, such as "Comment on “the Nile”". */
  thread: string;
  /** Says the passage can be gone to, on the quote. */
  jump: string;
  resolve: string;
  reopen: string;
  /** Said where the passage was deleted from the document. */
  detached: string;
  edited: string;
  /** Names a comment's menu, by its author. */
  actions: (author: string) => string;
  /** Who resolved it and when, shown on a resolved thread. */
  resolved?: string;
}

export interface CommentThreadProps {
  /** The passage as it read when the thread began; empty for a block without words. */
  quote: string;
  status: "open" | "resolved";
  /** The passage is no longer in the document. */
  detached?: boolean;
  /** The thread in hand, whose passage the document marks more strongly. */
  active?: boolean;
  comments: readonly CommentEntry[];
  labels: CommentThreadLabels;
  /** Brings the passage into view, where it is still in the document. */
  onJump?: () => void;
  onToggleResolved: () => void;
  pending?: boolean;
  /** Where a reply is written, under the comments. */
  children?: ReactNode;
}

/**
 * A conversation about a passage of a document being written (Google Docs,
 * Notion): the passage it is about, which goes to it, then each comment
 * with its author and time, a reply, and Resolve or Reopen. A thread whose
 * passage was deleted says so and keeps its words.
 */
export function CommentThread({
  quote,
  status,
  detached = false,
  active = false,
  comments,
  labels,
  onJump,
  onToggleResolved,
  pending = false,
  children,
}: CommentThreadProps) {
  const resolved = status === "resolved";
  const words = quote ? (
    <span className="line-clamp-2 break-words" dir="auto">
      {quote}
    </span>
  ) : null;
  return (
    <article
      aria-label={labels.thread}
      data-active={active || undefined}
      className={cn(
        "grid gap-3 rounded-lg border bg-card p-3 text-sm",
        active && "border-primary/60 ring-2 ring-primary/15",
        resolved && "bg-muted/40",
      )}
    >
      {detached ? (
        <p className="flex items-start gap-1.5 text-[13px] leading-[18px] text-muted-foreground">
          <Unlink className="mt-px size-3.5 shrink-0" aria-hidden />
          <span className="grid gap-0.5">
            <span>{labels.detached}</span>
            {words ? <s className="text-muted-foreground/80">{words}</s> : null}
          </span>
        </p>
      ) : words && onJump ? (
        <button
          type="button"
          onClick={onJump}
          title={labels.jump}
          className="border-s-2 border-warning ps-2 text-start text-[13px] leading-[18px] text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          <span className="sr-only">{labels.jump}: </span>
          {words}
        </button>
      ) : words ? (
        <blockquote className="border-s-2 border-warning ps-2 text-[13px] leading-[18px] text-muted-foreground">
          {words}
        </blockquote>
      ) : null}
      <ol className="grid gap-3">
        {comments.map((comment) => (
          <li key={comment.id} className="grid gap-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="min-w-0 truncate font-medium">
                {comment.author}
              </span>
              <time
                dateTime={comment.at}
                className="shrink-0 text-xs text-muted-foreground"
              >
                {comment.when}
              </time>
              {comment.edited ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  · {labels.edited}
                </span>
              ) : null}
              {comment.actions && comment.actions.length > 0 ? (
                <ActionMenu
                  label={labels.actions(comment.author)}
                  actions={comment.actions}
                  className="ms-auto -my-1 size-7"
                />
              ) : null}
            </div>
            {comment.editing ?? (
              <p className="break-words whitespace-pre-wrap" dir="auto">
                {comment.body}
              </p>
            )}
          </li>
        ))}
      </ol>
      {resolved && labels.resolved ? (
        <p className="text-xs text-muted-foreground">{labels.resolved}</p>
      ) : null}
      {children}
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={onToggleResolved}
        >
          {pending ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : resolved ? (
            <RotateCcw aria-hidden />
          ) : (
            <Check aria-hidden />
          )}
          {resolved ? labels.reopen : labels.resolve}
        </Button>
      </div>
    </article>
  );
}

/** Someone a comment may mention. */
export interface MentionCandidate {
  id: string;
  label: string;
  /** Tells them from others of the same name, such as their role. */
  detail?: string;
}

/** A comment as it is being written, with the people picked for it. */
export interface CommentDraft {
  text: string;
  mentions: MentionCandidate[];
}

export const EMPTY_DRAFT: CommentDraft = { text: "", mentions: [] };

/** The words a comment box says, in the app's language. */
export interface CommentComposerLabels {
  field: string;
  placeholder: string;
  submit: string;
  cancel?: string;
  /** Names the list of people an @ offers. */
  people: string;
}

export interface CommentComposerProps {
  value: CommentDraft;
  onChange: (value: CommentDraft) => void;
  onSubmit: () => void;
  /** Offers a way out, as an edit or a new thread has. */
  onCancel?: () => void;
  labels: CommentComposerLabels;
  /** People whose names match what follows an @. */
  findPeople?: (query: string) => Promise<MentionCandidate[]>;
  pending?: boolean;
  /** Takes the caret as it appears, as a box opened to write in should. */
  initialFocus?: boolean;
  /** Why the comment was not kept, under the box. */
  error?: string | null;
}

/** The words typed after an @ just before the caret, if any. */
function mentionQuery(text: string, caret: number): string | null {
  const match = /(?:^|\s)@([^\s@]{0,30})$/u.exec(text.slice(0, caret));
  return match ? (match[1] ?? "") : null;
}

/**
 * A box to write a comment or a reply in. Typing @ offers colleagues by
 * name, and the one picked is written in and remembered, so they can be
 * told. Ctrl or Cmd with Enter sends it.
 */
export function CommentComposer({
  value,
  onChange,
  onSubmit,
  onCancel,
  labels,
  findPeople,
  pending = false,
  initialFocus = false,
  error,
}: CommentComposerProps) {
  const field = useRef<HTMLTextAreaElement>(null);
  const list = useId();
  const [query, setQuery] = useState<string | null>(null);
  // The people found, with the words they were found for, so a list for
  // an earlier query never shows under a later one.
  const [found, setFound] = useState<{
    query: string;
    options: MentionCandidate[];
  } | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  useEffect(() => {
    if (initialFocus) field.current?.focus();
  }, [initialFocus]);
  useEffect(() => {
    if (query === null || !findPeople) return undefined;
    let current = true;
    const timer = setTimeout(() => {
      void findPeople(query).then(
        (options) => {
          if (!current) return;
          setFound({ query, options });
          setHighlighted(0);
        },
        () => {
          if (current) setFound({ query, options: [] });
        },
      );
    }, 150);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, findPeople]);
  const options = found && found.query === query ? found.options : [];
  const showing = query !== null && options.length > 0;
  const pick = (person: MentionCandidate) => {
    const element = field.current;
    const caret = element?.selectionStart ?? value.text.length;
    const before = value.text.slice(0, caret);
    const at = before.lastIndexOf("@");
    const inserted = `@${person.label} `;
    const text = `${value.text.slice(0, at)}${inserted}${value.text.slice(caret)}`;
    onChange({
      text,
      mentions: [
        ...value.mentions.filter((other) => other.id !== person.id),
        person,
      ],
    });
    setQuery(null);
    const next = at + inserted.length;
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(next, next);
    });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showing) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setHighlighted(
          (highlighted + step + options.length) % options.length,
        );
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const person = options[highlighted];
        if (person) {
          event.preventDefault();
          pick(person);
          return;
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setQuery(null);
        return;
      }
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (value.text.trim() && !pending) onSubmit();
      return;
    }
    if (event.key === "Escape" && onCancel) {
      event.preventDefault();
      onCancel();
    }
  };
  const errorId = `${list}-error`;
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.text.trim() && !pending) onSubmit();
      }}
    >
      <div className="relative">
        <textarea
          ref={field}
          rows={2}
          dir="auto"
          aria-label={labels.field}
          aria-autocomplete={findPeople ? "list" : undefined}
          aria-controls={showing ? list : undefined}
          aria-activedescendant={
            showing ? `${list}-${highlighted}` : undefined
          }
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          placeholder={labels.placeholder}
          value={value.text}
          maxLength={2000}
          disabled={pending}
          onChange={(event) => {
            onChange({ ...value, text: event.target.value });
            setQuery(
              mentionQuery(
                event.target.value,
                event.target.selectionStart ?? event.target.value.length,
              ),
            );
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setQuery(null)}
          className="field-sizing-content block max-h-48 min-h-16 w-full resize-none rounded-md border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
        />
        {showing ? (
          <div
            id={list}
            role="listbox"
            aria-label={labels.people}
            className="absolute inset-x-0 top-full z-10 mt-1 grid max-h-56 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          >
            {options.map((person, index) => (
              <div
                key={person.id}
                id={`${list}-${index}`}
                role="option"
                tabIndex={-1}
                aria-selected={index === highlighted}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(person);
                }}
                onMouseEnter={() => setHighlighted(index)}
                className="grid cursor-default rounded-sm px-2 py-1.5 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
              >
                <span className="truncate">{person.label}</span>
                {person.detail ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {person.detail}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={onCancel}
          >
            {labels.cancel}
          </Button>
        ) : null}
        <Button
          type="submit"
          size="sm"
          disabled={pending || value.text.trim() === ""}
        >
          {pending ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : null}
          {labels.submit}
        </Button>
      </div>
    </form>
  );
}
