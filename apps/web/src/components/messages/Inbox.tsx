import type { InboxQuery, Mailbox } from "@faridalms/domain/messages";

import { INBOX_BOXES } from "@faridalms/domain/messages";
import { cn } from "@faridalms/ui/cn";
import { Input } from "@faridalms/ui/input";
import { Skeleton } from "@faridalms/ui/skeleton";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Inbox as InboxIcon, PenSquare, Search } from "lucide-react";
import { Suspense } from "react";
import * as v from "valibot";

import { EmptyState, PageHeader } from "~/components/system/IndexPage";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { inboxQuery } from "~/queries/messages";

import { Conversation } from "./Conversation";
import { nameOf, threadTitle, whenShort } from "./format";
import { NewMessage } from "./NewMessage";

const uuid = v.pipe(v.string(), v.uuid());

export const messagesSearchSchema = v.object({
  thread: v.optional(v.union([v.literal(""), uuid]), ""),
  show: v.optional(v.picklist(["all", "unread"]), "all"),
  box: v.optional(v.picklist(INBOX_BOXES), "all"),
  q: v.optional(v.pipe(v.string(), v.maxLength(100)), ""),
  compose: v.optional(v.boolean(), false),
});
export type MessagesSearch = v.InferOutput<typeof messagesSearchSchema>;

export function inboxOf(search: MessagesSearch): InboxQuery {
  return { show: search.show, box: search.box, q: search.q.trim() };
}

/** A team's mailbox, as Messages names it. */
export const MAILBOX_LABEL: Record<Mailbox, () => string> = {
  admissions: m.msgBoxAdmissions,
  attendance: m.msgBoxAttendance,
};

type Row = Awaited<
  ReturnType<NonNullable<ReturnType<typeof inboxQuery>["queryFn"]>>
>["rows"][number];

function ThreadItem({
  row,
  selected,
  today,
  onOpen,
}: {
  row: Row;
  selected: boolean;
  today: string;
  onOpen: () => void;
}) {
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
            <span className="shrink-0 rounded-sm bg-muted px-1.5 text-[11px] leading-[18px] font-medium">
              {MAILBOX_LABEL[row.mailbox]()}
            </span>
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
              {row.unread}
              <span className="sr-only"> {m.msgUnread()}</span>
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

function ThreadList({
  search,
  onSearch,
}: {
  search: MessagesSearch;
  onSearch: (change: Partial<MessagesSearch>) => void;
}) {
  const user = useCurrentUser();
  const { rows, mailboxes } = useSuspenseQuery(
    inboxQuery(inboxOf(search)),
  ).data;
  return (
    <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] content-start">
      <div className="grid gap-2 border-b p-3">
        <label htmlFor="inbox-search" className="sr-only">
          {m.msgSearch()}
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="inbox-search"
            type="search"
            className="ps-8 max-md:h-10"
            placeholder={m.msgSearchPlaceholder()}
            value={search.q}
            onChange={(event) => onSearch({ q: event.target.value })}
          />
        </div>
        {mailboxes.length ? (
          <fieldset className="flex flex-wrap gap-1">
            <legend className="sr-only">{m.msgBox()}</legend>
            {(["all", "personal", ...mailboxes] as const).map((box) => (
              <button
                key={box}
                type="button"
                aria-pressed={search.box === box}
                onClick={() => onSearch({ box })}
                className={cn(
                  "h-8 rounded-md px-3 text-[13px] font-medium max-md:h-10",
                  search.box === box
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60",
                )}
              >
                {box === "all"
                  ? m.msgBoxAll()
                  : box === "personal"
                    ? m.msgBoxPersonal()
                    : MAILBOX_LABEL[box]()}
              </button>
            ))}
          </fieldset>
        ) : null}
        <fieldset className="flex gap-1">
          <legend className="sr-only">{m.msgShow()}</legend>
          {(["all", "unread"] as const).map((show) => (
            <button
              key={show}
              type="button"
              aria-pressed={search.show === show}
              onClick={() => onSearch({ show })}
              className={cn(
                "h-8 rounded-md px-3 text-[13px] font-medium max-md:h-10",
                search.show === show
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60",
              )}
            >
              {show === "all" ? m.msgShowAll() : m.msgShowUnread()}
            </button>
          ))}
        </fieldset>
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-sm leading-5 text-muted-foreground">
          {search.q || search.show === "unread"
            ? m.msgNoMatches()
            : m.msgNoThreads()}
        </p>
      ) : (
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

/**
 * Conversations beside the open one from 1024px; below that the list and the
 * conversation take the screen in turn.
 */
export function MessagesPage({
  search,
  onSearch,
}: {
  search: MessagesSearch;
  onSearch: (change: Partial<MessagesSearch>, replace?: boolean) => void;
}) {
  const inbox = useSuspenseQuery(inboxQuery(inboxOf(search))).data;
  const open = search.thread !== "";
  return (
    <>
      <div className={cn(open && "max-lg:hidden")}>
        <PageHeader
          title={m.msgTitle()}
          description={m.msgHint()}
          action={
            inbox.canStart
              ? {
                  label: m.msgNew(),
                  icon: PenSquare,
                  onClick: () => onSearch({ compose: true }),
                }
              : undefined
          }
        />
      </div>
      <div className="grid min-h-[32rem] overflow-hidden rounded-lg border bg-card lg:h-[calc(100svh-13rem)] lg:grid-cols-[22rem_minmax(0,1fr)]">
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
        <NewMessage
          canStartFamily={inbox.canStartFamily}
          onClose={() => onSearch({ compose: false }, true)}
          onStarted={(threadId) =>
            onSearch({ compose: false, thread: threadId ?? "" }, true)
          }
        />
      ) : null}
    </>
  );
}
