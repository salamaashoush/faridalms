import type { Anchor } from "@faridalms/domain/anchors";
import type { CommentMark, EditorComments } from "@faridalms/editor";
import type {
  CommentDraft,
  CommentEntry,
  MentionCandidate,
} from "@faridalms/ui/system/comment-thread";
import type { ReactNode } from "react";

import {
  mentionedIn,
  threadsInOrder,
} from "@faridalms/domain/document-comments";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import {
  CommentComposer,
  CommentThread,
  EMPTY_DRAFT,
} from "@faridalms/ui/system/comment-thread";
import { SidePanel, sidePanelRoom } from "@faridalms/ui/system/side-panel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@faridalms/ui/tooltip";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { MessageSquare, Pencil, Trash2 } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import type { CommentThread as Thread } from "~/queries/comments";

import { inLocale } from "~/hooks/useCurrentUser";
import { useMedia } from "~/hooks/useMedia";
import * as m from "~/i18n/messages";
import { commentThreadsQuery } from "~/queries/comments";
import {
  editComment,
  findColleagues,
  removeComment,
  replyToThread,
  resolveThread,
  startCommentThread,
} from "~/server/comments";
import { formatInstant, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

/** Where a page's comments are kept and which of its editors shows them. */
export interface CommentsHost {
  hostType: string;
  hostId: string;
  /** The id of the editor the threads are marked in. */
  editor: string;
  /**
   * Which of the record's documents that editor shows, where the page edits
   * more than one, such as "translation" beside the original "body".
   */
  part?: string;
}

interface CommentsState {
  host: CommentsHost;
  part: string;
  threads: Thread[];
  open: boolean;
  setOpen: (open: boolean) => void;
  active: string | null;
  setActive: (id: string | null) => void;
  /** A thread being started, before its first comment is sent. */
  starting: { anchor: Anchor; quote: string } | null;
  setStarting: (starting: { anchor: Anchor; quote: string } | null) => void;
  /** The threads the editor found, in reading order; null until it says. */
  placed: readonly string[] | null;
  setPlaced: (ids: readonly string[]) => void;
  reveal: { id: string; at: number } | undefined;
  revealThread: (id: string) => void;
}

const Comments = createContext<CommentsState | null>(null);

export interface DocumentCommentsProviderProps {
  /** Absent while the record is not stored, and where nobody may comment. */
  host?: CommentsHost;
  children: ReactNode;
}

/**
 * Holds a document page's comments: the threads, which one is in hand, a
 * thread being started, and whether the panel is open. A link to
 * `#thread-<id>`, as a mention's notice gives, opens the panel on it.
 */
export function DocumentCommentsProvider({
  host,
  children,
}: DocumentCommentsProviderProps) {
  // One element whether or not there is a host yet: a record stored while
  // it is being written gains one, and swapping the element would remount
  // the page and its editor under the writer's caret.
  const part = host?.part ?? "body";
  const hash = useLocation({ select: (location) => location.hash });
  const linked = /^thread-([\da-f-]{36})$/.exec(hash)?.[1] ?? null;
  const query = useQuery(commentThreadsQuery(host));
  const [open, setOpen] = useState(linked !== null);
  const [active, setActive] = useState<string | null>(linked);
  const [starting, setStarting] = useState<{
    anchor: Anchor;
    quote: string;
  } | null>(null);
  const [placed, setPlacedIds] = useState<readonly string[] | null>(null);
  const [reveal, setReveal] = useState<{ id: string; at: number }>();
  const revealThread = useCallback((id: string) => {
    setActive(id);
    setReveal({ id, at: Date.now() });
  }, []);
  // A thread linked to is brought into view once the editor has found it.
  const shown = useRef(false);
  const setPlaced = useCallback(
    (ids: readonly string[]) => {
      setPlacedIds(ids);
      if (linked && !shown.current && ids.includes(linked)) {
        shown.current = true;
        revealThread(linked);
      }
    },
    [linked, revealThread],
  );
  const value = useMemo<CommentsState | null>(
    () =>
      host
        ? {
            host,
            part,
            threads: query.data ?? [],
            open,
            setOpen,
            active,
            setActive,
            starting,
            setStarting,
            placed,
            setPlaced,
            reveal,
            revealThread,
          }
        : null,
    [
      host,
      part,
      query.data,
      open,
      active,
      starting,
      placed,
      setPlaced,
      reveal,
      revealThread,
    ],
  );
  return <Comments.Provider value={value}>{children}</Comments.Provider>;
}

/**
 * The comments an editor marks and starts, when it is the editor the
 * page's comments belong to; nothing for any other.
 */
export function useEditorComments(
  editorId: string,
): EditorComments | undefined {
  const state = useContext(Comments);
  const mine = state?.host.editor === editorId ? state : null;
  const data = mine?.threads;
  const part = mine?.part;
  const threads = useMemo<CommentMark[]>(
    () =>
      (data ?? []).flatMap((thread) => {
        return thread.part === part
          ? [
              {
                id: thread.id,
                anchor: thread.anchor,
                resolved: thread.resolvedAt !== null,
              },
            ]
          : [];
      }),
    [data, part],
  );
  const setOpen = mine?.setOpen;
  const setActive = mine?.setActive;
  const setStarting = mine?.setStarting;
  const setPlaced = mine?.setPlaced;
  const active = mine?.active ?? null;
  const reveal = mine?.reveal;
  return useMemo(
    () =>
      setOpen && setActive && setStarting && setPlaced
        ? {
            threads,
            active,
            reveal,
            start: (anchor, quote) => {
              setStarting({ anchor, quote });
              setActive(null);
              setOpen(true);
            },
            open: (id) => {
              setActive(id);
              setOpen(true);
            },
            onPlaced: setPlaced,
          }
        : undefined,
    [threads, active, reveal, setOpen, setActive, setStarting, setPlaced],
  );
}

export interface CommentsRoomProps {
  children: ReactNode;
}

/** The room a page leaves for the comments while they are docked beside it. */
export function CommentsRoom({ children }: CommentsRoomProps) {
  const state = useContext(Comments);
  const docked = useMedia("(min-width: 64rem)");
  return (
    <div className={cn(state?.open && docked && sidePanelRoom)}>{children}</div>
  );
}

/** Opens and closes the comments, saying how many threads are open. */
export function CommentsToggle() {
  const state = useContext(Comments);
  if (!state) return null;
  const count = state.threads.filter(
    (thread) => thread.resolvedAt === null,
  ).length;
  const label =
    count > 0
      ? m.cmtOpenCount({ count, value: formatNumber(count) })
      : m.cmtTitle();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={label}
            aria-pressed={state.open}
            aria-expanded={state.open}
            onClick={() => state.setOpen(!state.open)}
          />
        }
      >
        <MessageSquare aria-hidden />
        {count > 0 ? (
          <span className="hidden sm:inline" aria-hidden>
            {label}
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipContent>{m.cmtTitle()}</TooltipContent>
    </Tooltip>
  );
}

const nameOf = (en: string | null, ar: string | null) =>
  inLocale(en, ar) || m.cmtSomeone();

/** The comments panel: open threads in the order their passages stand, resolved ones folded away. */
export function CommentsPanel() {
  const state = useContext(Comments);
  const docked = useMedia("(min-width: 64rem)");
  const phone = !useMedia("(min-width: 48rem)");
  if (!state) return null;
  const { open, resolved } = threadsInOrder(state.threads, state.placed ?? []);
  return (
    <SidePanel
      open={state.open}
      onOpenChange={state.setOpen}
      title={m.cmtTitle()}
      docked={docked}
      phone={phone}
    >
      {state.starting ? <NewThread state={state} /> : null}
      {open.length === 0 && !state.starting ? (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.cmtHint()}
        </p>
      ) : null}
      {open.map((thread) => (
        <ThreadCard key={thread.id} thread={thread} state={state} />
      ))}
      {resolved.length > 0 ? (
        <details className="group grid gap-3">
          <summary className="cursor-default rounded-md px-1 py-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">
            {m.cmtResolvedCount({
              count: resolved.length,
              value: formatNumber(resolved.length),
            })}
          </summary>
          <div className="mt-3 grid gap-3">
            {resolved.map((thread) => (
              <ThreadCard key={thread.id} thread={thread} state={state} />
            ))}
          </div>
        </details>
      ) : null}
    </SidePanel>
  );
}

function useFindPeople(host: CommentsHost) {
  const { hostType, hostId } = host;
  return useCallback(
    async (q: string): Promise<MentionCandidate[]> =>
      (await findColleagues({ data: { hostType, hostId, q } })).map(
        ({ id, label, detail }) => ({ id, label, detail }),
      ),
    [hostType, hostId],
  );
}

const composerLabels = (field: string, submit: string) => ({
  field,
  placeholder: m.cmtPlaceholder(),
  submit,
  cancel: m.cmtCancel(),
  people: m.cmtPeople(),
});

const failed = (error: unknown) => toast.error(getMessageFromError(error));

function useRefresh(host: CommentsHost) {
  const client = useQueryClient();
  return () =>
    client.invalidateQueries({
      queryKey: commentThreadsQuery(host).queryKey,
    });
}

interface NewThreadProps {
  state: CommentsState;
}

function NewThread({ state }: NewThreadProps) {
  const [draft, setDraft] = useState<CommentDraft>(EMPTY_DRAFT);
  const findPeople = useFindPeople(state.host);
  const refresh = useRefresh(state.host);
  const starting = state.starting;
  const start = useMutation({
    mutationFn: () => {
      if (!starting) throw new Error("no passage to comment on");
      return startCommentThread({
        data: {
          hostType: state.host.hostType,
          hostId: state.host.hostId,
          part: state.part,
          anchor: starting.anchor,
          quote: starting.quote,
          body: draft.text,
          mentions: mentionedIn(draft.text, draft.mentions),
        },
      });
    },
    onSuccess: async (made) => {
      state.setStarting(null);
      state.setActive(made.id);
      await refresh();
    },
  });
  if (!starting) return null;
  return (
    <section
      aria-label={m.cmtNew()}
      className="grid gap-2 rounded-lg border border-primary/60 bg-card p-3 ring-2 ring-primary/15"
    >
      {starting.quote ? (
        <blockquote
          dir="auto"
          className="line-clamp-2 border-s-2 border-warning ps-2 text-[13px] leading-[18px] text-muted-foreground"
        >
          {starting.quote}
        </blockquote>
      ) : null}
      <CommentComposer
        value={draft}
        onChange={setDraft}
        onSubmit={() => start.mutate()}
        onCancel={() => state.setStarting(null)}
        labels={composerLabels(m.cmtComment(), m.cmtComment())}
        findPeople={findPeople}
        pending={start.isPending}
        error={start.error ? getMessageFromError(start.error) : null}
        initialFocus
      />
    </section>
  );
}

interface ThreadCardProps {
  thread: Thread;
  state: CommentsState;
}

function ThreadCard({ thread, state }: ThreadCardProps) {
  const findPeople = useFindPeople(state.host);
  const refresh = useRefresh(state.host);
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState<CommentDraft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<{
    id: string;
    version: number;
    draft: CommentDraft;
  } | null>(null);
  const send = useMutation({
    mutationFn: () =>
      replyToThread({
        data: {
          threadId: thread.id,
          body: reply.text,
          mentions: mentionedIn(reply.text, reply.mentions),
        },
      }),
    onSuccess: async () => {
      setReply(EMPTY_DRAFT);
      setReplying(false);
      await refresh();
    },
  });
  const change = useMutation({
    mutationFn: (input: { id: string; version: number; draft: CommentDraft }) =>
      editComment({
        data: {
          commentId: input.id,
          expectedVersion: input.version,
          body: input.draft.text,
          mentions: mentionedIn(input.draft.text, input.draft.mentions),
        },
      }),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
  });
  const settle = useMutation({
    mutationFn: () =>
      resolveThread({
        data: {
          threadId: thread.id,
          expectedVersion: thread.version,
          resolved: thread.resolvedAt === null,
        },
      }),
    onSuccess: refresh,
    onError: failed,
  });
  const ownPart = thread.part === state.part;
  const detached =
    ownPart && state.placed !== null && !state.placed.includes(thread.id);
  const resolver = nameOf(thread.resolvedByNameEn, thread.resolvedByNameAr);
  const comments: CommentEntry[] = thread.comments.map((comment) => {
    const author = nameOf(comment.authorNameEn, comment.authorNameAr);
    const draft = editing?.id === comment.id ? editing : null;
    return {
      id: comment.id,
      author,
      when: formatInstant(comment.createdAt, "medium"),
      at: comment.createdAt,
      body: comment.body,
      edited: comment.editedAt !== null,
      actions: comment.own
        ? [
            {
              label: m.cmtEdit(),
              icon: Pencil,
              onSelect: () =>
                setEditing({
                  id: comment.id,
                  version: comment.version,
                  draft: { text: comment.body, mentions: [] },
                }),
            },
            {
              label: m.cmtDelete(),
              icon: Trash2,
              destructive: true,
              confirm: {
                title: m.cmtDeleteTitle(),
                body: m.cmtDeleteBody(),
                label: m.cmtDelete(),
              },
              onSelect: async () => {
                await removeComment({
                  data: {
                    commentId: comment.id,
                    expectedVersion: comment.version,
                  },
                });
                await refresh();
              },
            },
          ]
        : [],
      ...(draft
        ? {
            editing: (
              <CommentComposer
                value={draft.draft}
                onChange={(next) => setEditing({ ...draft, draft: next })}
                onSubmit={() => change.mutate(draft)}
                onCancel={() => setEditing(null)}
                labels={composerLabels(m.cmtEditField(), m.cmtSave())}
                findPeople={findPeople}
                pending={change.isPending}
                error={change.error ? getMessageFromError(change.error) : null}
                initialFocus
              />
            ),
          }
        : {}),
    };
  });
  return (
    <CommentThread
      quote={thread.quote}
      status={thread.resolvedAt === null ? "open" : "resolved"}
      detached={detached}
      active={state.active === thread.id}
      comments={comments}
      labels={{
        thread: thread.quote
          ? m.cmtThreadOn({ quote: thread.quote })
          : m.cmtThreadBlock(),
        jump: m.cmtJump(),
        resolve: m.cmtResolve(),
        reopen: m.cmtReopen(),
        detached: m.cmtDetached(),
        edited: m.cmtEdited(),
        actions: (author) => m.cmtActions({ name: author }),
        ...(thread.resolvedAt
          ? {
              resolved: m.cmtResolvedBy({
                name: resolver,
                when: formatInstant(thread.resolvedAt, "medium"),
              }),
            }
          : {}),
      }}
      onJump={
        ownPart && !detached ? () => state.revealThread(thread.id) : undefined
      }
      onToggleResolved={() => settle.mutate()}
      pending={settle.isPending}
    >
      {thread.resolvedAt !== null ? null : replying ? (
        <CommentComposer
          value={reply}
          onChange={setReply}
          onSubmit={() => send.mutate()}
          onCancel={() => {
            setReply(EMPTY_DRAFT);
            setReplying(false);
          }}
          labels={composerLabels(m.cmtReply(), m.cmtSend())}
          findPeople={findPeople}
          pending={send.isPending}
          error={send.error ? getMessageFromError(send.error) : null}
          initialFocus
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() => {
            setReplying(true);
            state.setActive(thread.id);
          }}
        >
          {m.cmtReply()}
        </Button>
      )}
    </CommentThread>
  );
}
