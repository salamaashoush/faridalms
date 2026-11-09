import type {
  InboxQuery,
  InboxView,
  Mailbox,
} from "@faridalms/domain/messages";
import type { QueryClient } from "@tanstack/react-query";

import { INBOX_VIEWS } from "@faridalms/domain/messages";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { Skeleton } from "@faridalms/ui/skeleton";
import { ConfirmDialog } from "@faridalms/ui/system/confirm-dialog";
import {
  EmptyState,
  FilteredEmptyState,
} from "@faridalms/ui/system/empty-state";
import { IndexToolbar } from "@faridalms/ui/system/index-toolbar";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { Segmented } from "@faridalms/ui/system/panel";
import {
  useMutation,
  useQueryClient,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  FilePen,
  Inbox as InboxIcon,
  Paperclip,
  PenSquare,
  Trash2,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  draftQuery,
  draftsQuery,
  inboxQuery,
  threadQuery,
} from "~/queries/messages";
import { discardMessageDraft } from "~/server/messages";
import { formatNumber, formatList } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { Conversation } from "./Conversation";
import { nameOf, threadTitle, whenShort } from "./format";
import { NewMessage } from "./NewMessage";

const uuid = v.pipe(v.string(), v.uuid());

export const messagesSearchSchema = v.object({
  thread: v.optional(v.union([v.literal(""), uuid]), ""),
  show: v.optional(v.picklist(["all", "unread"]), "all"),
  box: v.optional(v.picklist(INBOX_VIEWS), "all"),
  q: v.optional(v.pipe(v.string(), v.maxLength(100)), ""),
  compose: v.optional(v.boolean(), false),
  /** The draft the compose sheet writes on. */
  draft: v.optional(v.union([v.literal(""), uuid]), ""),
});
export type MessagesSearch = v.InferOutput<typeof messagesSearchSchema>;

export function inboxOf(search: MessagesSearch): InboxQuery {
  return {
    show: search.show,
    box: search.box === "drafts" ? "all" : search.box,
    q: search.q.trim(),
  };
}

/** What every Messages route loads before it renders. */
export async function loadMessages(
  queryClient: QueryClient,
  search: MessagesSearch,
) {
  await Promise.all([
    queryClient.ensureInfiniteQueryData(inboxQuery(inboxOf(search))),
    ...(search.box === "drafts"
      ? [queryClient.ensureInfiniteQueryData(draftsQuery)]
      : []),
    ...(search.thread
      ? [queryClient.ensureQueryData(threadQuery(search.thread))]
      : []),
    ...(search.compose && search.draft
      ? [queryClient.ensureQueryData(draftQuery(search.draft))]
      : []),
  ]);
}

/** A team's mailbox, as Messages names it. */
export const MAILBOX_LABEL: Record<Mailbox, () => string> = {
  admissions: m.msgBoxAdmissions,
  attendance: m.msgBoxAttendance,
};

type Row = Awaited<
  ReturnType<NonNullable<ReturnType<typeof inboxQuery>["queryFn"]>>
>["rows"][number];
type DraftRow = Awaited<
  ReturnType<NonNullable<(typeof draftsQuery)["queryFn"]>>
>["rows"][number];

const marker =
  "shrink-0 rounded-sm bg-muted px-1.5 text-[11px] leading-[18px] font-medium";

interface ThreadItemProps {
  row: Row;
  selected: boolean;
  today: string;
  onOpen: () => void;
}

function ThreadItem({ row, selected, today, onOpen }: ThreadItemProps) {
  const people = row.mailbox
    ? row.others.filter((other) => other.userId !== row.owner?.userId)
    : row.others;
  const preview = row.lastBody
    ? row.lastKind && row.lastKind !== "message"
      ? m.msgPreviewInternal({ body: row.lastBody })
      : row.lastAuthorId &&
          row.others.some(
            (other) =>
              other.userId === row.lastAuthorId ||
              other.contactId === row.lastAuthorId,
          )
        ? m.msgPreviewFrom({
            name: nameOf({
              fullNameEn: row.lastAuthorNameEn,
              fullNameAr: row.lastAuthorNameAr,
            }),
            body: row.lastBody,
          })
        : m.msgPreviewYou({ body: row.lastBody })
    : "";
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-0.5 px-4 py-3 text-start transition-colors hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none",
          selected && "bg-muted",
        )}
      >
        <span className="flex items-baseline justify-between gap-3">
          <span
            className={cn(
              "min-w-0 truncate text-sm leading-5",
              row.unread ? "font-semibold" : "font-medium",
            )}
          >
            {threadTitle({
              subject: row.mailbox ? null : row.subject,
              others: people,
            })}
          </span>
          <span className="shrink-0 text-[13px] leading-[18px] text-muted-foreground tabular-nums">
            {whenShort(row.lastMessageAt, today)}
          </span>
        </span>
        {row.mailbox ? (
          <span className="flex min-w-0 items-center gap-1.5 text-[13px] leading-[18px] text-muted-foreground">
            <span className={marker}>{MAILBOX_LABEL[row.mailbox]()}</span>
            <span className="truncate">
              {row.owner
                ? m.msgHeldBy({ name: nameOf(row.owner) })
                : m.msgUnassigned()}
            </span>
          </span>
        ) : null}
        {row.studentId ? (
          <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
            {m.msgAbout({
              name: nameOf({
                fullNameEn: row.studentNameEn,
                fullNameAr: row.studentNameAr,
              }),
            })}
          </span>
        ) : null}
        <span className="flex items-center justify-between gap-3">
          <span
            dir="auto"
            className={cn(
              "min-w-0 truncate text-[13px] leading-[18px]",
              row.unread ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {preview}
          </span>
          {row.unread ? (
            <span className="shrink-0 rounded-full bg-primary px-1.5 text-[11px] leading-[18px] font-semibold text-primary-foreground tabular-nums">
              {formatNumber(row.unread)}
              <span className="sr-only"> {m.msgUnread()}</span>
            </span>
          ) : null}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-[12px] leading-4 text-muted-foreground">
          {row.messageCount > 0 ? (
            <span>
              {m.msgMessageCount({
                count: row.messageCount,
                shown: formatNumber(row.messageCount),
              })}
            </span>
          ) : null}
          {row.hasFiles ? (
            <span className="flex items-center gap-1">
              <Paperclip aria-hidden className="size-3" />
              {m.msgHasFiles()}
            </span>
          ) : null}
          {row.hasDraft ? (
            <span className="flex items-center gap-1 font-medium text-foreground">
              <FilePen aria-hidden className="size-3" />
              {m.msgDraftLabel()}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

interface MoreButtonProps {
  label: string;
  pending: boolean;
  onMore: () => void;
}

function MoreButton({ label, pending, onMore }: MoreButtonProps) {
  return (
    <div className="flex justify-center border-t p-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="max-md:h-10"
        disabled={pending}
        onClick={onMore}
      >
        {label}
      </Button>
    </div>
  );
}

/** Whom a draft is for, as its row and its deletion name it. */
function draftTitle(row: DraftRow) {
  const names = formatList(row.to.map(nameOf).filter(Boolean));
  if (row.threadId)
    return row.subject ?? (names ? m.msgDraftReply({ names }) : m.msgOnlyYou());
  if (row.subject) return row.subject;
  if (names) return m.msgDraftTo({ names });
  if (row.studentNameEn || row.studentNameAr)
    return m.msgToGuardiansOf({
      name: nameOf({
        fullNameEn: row.studentNameEn,
        fullNameAr: row.studentNameAr,
      }),
    });
  return m.msgDraftNoOne();
}

interface DraftItemProps {
  row: DraftRow;
  today: string;
  onOpen: () => void;
  onDelete: () => void;
}

function DraftItem({ row, today, onOpen, onDelete }: DraftItemProps) {
  const title = draftTitle(row);
  return (
    <li className="flex items-stretch">
      <button
        type="button"
        onClick={onOpen}
        className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-0.5 py-3 ps-4 pe-2 text-start transition-colors hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none"
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-sm leading-5 font-medium">
            {title}
          </span>
          <span className="shrink-0 text-[13px] leading-[18px] text-muted-foreground tabular-nums">
            {whenShort(row.updatedAt, today)}
          </span>
        </span>
        {row.threadId && row.subject && row.to.length ? (
          <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
            {m.msgDraftReply({ names: formatList(row.to.map(nameOf)) })}
          </span>
        ) : null}
        <span className="flex items-center gap-2">
          <span className={cn(marker, "text-foreground")}>
            {m.msgDraftLabel()}
          </span>
          <span
            dir="auto"
            className="min-w-0 truncate text-[13px] leading-[18px] text-muted-foreground"
          >
            {row.body || m.msgDraftNothing()}
          </span>
          {row.hasFiles ? (
            <Paperclip
              aria-label={m.msgHasFiles()}
              className="size-3 shrink-0 text-muted-foreground"
            />
          ) : null}
        </span>
      </button>
      <div className="flex items-center pe-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="max-md:size-10"
          aria-label={m.msgDraftDelete({ title })}
          onClick={onDelete}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
    </li>
  );
}

interface DraftListProps {
  onSearch: (change: Partial<MessagesSearch>) => void;
}

function DraftList({ onSearch }: DraftListProps) {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const drafts = useSuspenseInfiniteQuery(draftsQuery);
  const rows = drafts.data.pages.flatMap((page) => page.rows);
  const [deleting, setDeleting] = useState<DraftRow | null>(null);
  const discard = useMutation({
    mutationFn: (row: DraftRow) =>
      discardMessageDraft({ data: { id: row.id, version: row.version } }),
    meta: { inlineError: true },
  });
  if (rows.length === 0)
    return (
      <div className="p-4">
        <EmptyState placement="section" title={m.msgDraftsEmpty()} />
      </div>
    );
  return (
    <>
      <ul className="divide-y" aria-label={m.msgBoxDrafts()}>
        {rows.map((row) => (
          <DraftItem
            key={row.id}
            row={row}
            today={user.today}
            onOpen={() =>
              onSearch(
                row.threadId
                  ? { thread: row.threadId }
                  : { compose: true, draft: row.id },
              )
            }
            onDelete={() => {
              discard.reset();
              setDeleting(row);
            }}
          />
        ))}
      </ul>
      {drafts.hasNextPage ? (
        <MoreButton
          label={m.msgMoreDrafts()}
          pending={drafts.isFetchingNextPage}
          onMore={() => void drafts.fetchNextPage()}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        title={m.msgDraftDeleteTitle()}
        body={m.msgDraftDeleteBody({
          title: deleting ? draftTitle(deleting) : "",
        })}
        confirmLabel={m.msgDraftDeleteConfirm()}
        pending={discard.isPending}
        error={discard.error ? getMessageFromError(discard.error) : undefined}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          void discard.mutateAsync(deleting).then(
            async () => {
              setDeleting(null);
              toast.success(m.msgDraftDeleted());
              await queryClient.invalidateQueries({ queryKey: ["messages"] });
            },
            () => undefined,
          );
        }}
      />
    </>
  );
}

interface ThreadListProps {
  search: MessagesSearch;
  onSearch: (change: Partial<MessagesSearch>) => void;
}

function ThreadList({ search, onSearch }: ThreadListProps) {
  const user = useCurrentUser();
  const inbox = useSuspenseInfiniteQuery(inboxQuery(inboxOf(search)));
  const first = inbox.data.pages[0];
  const rows = inbox.data.pages.flatMap((page) => page.rows);
  const mailboxes = first?.mailboxes ?? [];
  const views: InboxView[] = [
    ...(mailboxes.length ? (["all", "personal", ...mailboxes] as const) : []),
    ...(first?.canStart
      ? mailboxes.length
        ? (["drafts"] as const)
        : (["all", "drafts"] as const)
      : []),
  ];
  const boxLabel = (box: InboxView) =>
    box === "all"
      ? mailboxes.length
        ? m.msgBoxAll()
        : m.msgConversations()
      : box === "personal"
        ? m.msgBoxPersonal()
        : box === "drafts"
          ? m.msgBoxDrafts()
          : MAILBOX_LABEL[box]();
  return (
    <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] content-start">
      <div className="border-b p-3">
        <IndexToolbar
          search={{
            value: search.q,
            onChange: (q) => onSearch({ q }),
            label: m.msgSearch(),
            placeholder: m.msgSearchPlaceholder(),
          }}
          facets={
            views.length
              ? [
                  {
                    id: "box",
                    label: m.msgBox(),
                    single: true,
                    defaultSelected: ["all"],
                    selected: [search.box],
                    options: views.map((box) => ({
                      value: box,
                      label: boxLabel(box),
                    })),
                    onChange: ([box]) => {
                      const view = views.find((one) => one === box);
                      if (view) onSearch({ box: view });
                    },
                  },
                ]
              : []
          }
          view={
            search.box === "drafts" ? undefined : (
              <Segmented
                label={m.msgShow()}
                value={search.show}
                options={[
                  { value: "all", label: m.msgShowAll() },
                  { value: "unread", label: m.msgShowUnread() },
                ]}
                onChange={(show) => onSearch({ show })}
              />
            )
          }
        />
      </div>
      {search.box === "drafts" ? (
        <Suspense fallback={<PaneFallback />}>
          <DraftList onSearch={onSearch} />
        </Suspense>
      ) : rows.length === 0 ? (
        <div className="p-4">
          {search.q || search.show === "unread" ? (
            <FilteredEmptyState
              placement="section"
              title={m.msgNoMatches()}
              onClear={() => onSearch({ q: "", show: "all" })}
            />
          ) : (
            <EmptyState placement="section" title={m.msgNoThreads()} />
          )}
        </div>
      ) : (
        <>
          <ul className="divide-y" aria-label={m.msgConversations()}>
            {rows.map((row) => (
              <ThreadItem
                key={row.id}
                row={row}
                selected={row.id === search.thread}
                today={user.today}
                onOpen={() => onSearch({ thread: row.id })}
              />
            ))}
          </ul>
          {inbox.hasNextPage ? (
            <MoreButton
              label={m.msgMoreThreads()}
              pending={inbox.isFetchingNextPage}
              onMore={() => void inbox.fetchNextPage()}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function PaneFallback() {
  return (
    <div className="grid gap-3 p-4">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

type ComposeProps = Omit<Parameters<typeof NewMessage>[0], "draft">;

/** A draft reopened from Drafts, or from a reloaded page that was writing it. */
function ReopenedDraft({
  id,
  onReply,
  ...props
}: ComposeProps & { id: string; onReply: (threadId: string) => void }) {
  const draft = useSuspenseQuery(draftQuery(id)).data;
  const reply = draft?.reply ? draft.threadId : null;
  useEffect(() => {
    if (reply) onReply(reply);
  }, [reply, onReply]);
  if (draft?.reply) return null;
  return <NewMessage {...props} draft={draft ?? undefined} />;
}

/**
 * The compose sheet. Which draft it writes on is fixed when it opens, so
 * the address naming the draft it has just kept does not open it again.
 */
function ComposeSheet({
  draftId,
  onReply,
  ...props
}: ComposeProps & { draftId: string; onReply: (threadId: string) => void }) {
  const [opened] = useState(draftId);
  if (!opened) return <NewMessage {...props} />;
  return (
    <Suspense fallback={null}>
      <ReopenedDraft id={opened} onReply={onReply} {...props} />
    </Suspense>
  );
}

export interface MessagesPageProps {
  search: MessagesSearch;
  onSearch: (change: Partial<MessagesSearch>, replace?: boolean) => void;
}

/**
 * Conversations beside the open one from 1024px; below that the list and the
 * conversation take the screen in turn.
 */
export function MessagesPage({ search, onSearch }: MessagesPageProps) {
  const inbox = useSuspenseInfiniteQuery(inboxQuery(inboxOf(search))).data
    .pages[0];
  const open = search.thread !== "";
  return (
    <Page width="list">
      <PageHeader
        title={m.msgTitle()}
        action={
          inbox?.canStart
            ? {
                label: m.msgNew(),
                icon: PenSquare,
                onClick: () => onSearch({ compose: true, draft: "" }),
              }
            : undefined
        }
      />
      {/* The shell's 48px bar, 24px above the page and 40px below it. */}
      <div className="grid min-h-[24rem] overflow-hidden rounded-lg border bg-card lg:h-[calc(100svh-7rem)] lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div
          className={cn(
            "min-h-0 min-w-0 overflow-x-hidden overflow-y-auto lg:border-e",
            open && "max-lg:hidden",
          )}
        >
          <ThreadList search={search} onSearch={onSearch} />
        </div>
        <div className={cn("min-h-0 min-w-0", !open && "max-lg:hidden")}>
          {open ? (
            <Suspense key={search.thread} fallback={<PaneFallback />}>
              <Conversation
                threadId={search.thread}
                onBack={() => onSearch({ thread: "" })}
              />
            </Suspense>
          ) : (
            <div className="grid h-full place-items-center p-6">
              <EmptyState
                icon={InboxIcon}
                title={m.msgPick()}
                description={m.msgPickBody()}
              />
            </div>
          )}
        </div>
      </div>
      {search.compose ? (
        <ComposeSheet
          draftId={search.draft}
          canStartFamily={inbox?.canStartFamily ?? false}
          childrenToName={inbox?.children ?? []}
          onReply={(threadId) =>
            onSearch({ compose: false, draft: "", thread: threadId }, true)
          }
          onKept={(draftId) => onSearch({ draft: draftId }, true)}
          onClose={() => onSearch({ compose: false, draft: "" }, true)}
          onStarted={(threadId) =>
            onSearch(
              { compose: false, draft: "", thread: threadId ?? "" },
              true,
            )
          }
        />
      ) : null}
    </Page>
  );
}
