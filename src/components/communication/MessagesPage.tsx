import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Inbox, Mail, Paperclip, Search, Send, SquarePen } from "lucide-react";
import { Suspense } from "react";
import * as v from "valibot";

import { EmptyState, PageHeader, Value } from "~/components/app/primitives";
import { ComposeMessage } from "~/components/communication/ComposeMessage";
import { MessageDetail } from "~/components/communication/MessageDetail";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import * as m from "~/i18n/messages";
import { messagesQuery } from "~/queries/school";
import { MESSAGE_FOLDERS, messagesQuerySchema } from "~/schema/school";
import { cn } from "~/utils/cn";
import { formatNumber, formatRelativeDays } from "~/utils/datetime";

/**
 * The server contract plus the two things the two-pane layout needs: which
 * message is open, and whether the composer is showing. Both belong in the URL
 * so a link to a message opens that message.
 */
export const messagesSearchSchema = v.object({
  ...messagesQuerySchema.entries,
  message: v.optional(v.string(), ""),
  compose: v.optional(v.boolean(), false),
});
export type MessagesSearch = v.InferOutput<typeof messagesSearchSchema>;

const FOLDER_LABEL: Record<(typeof MESSAGE_FOLDERS)[number], () => string> = {
  inbox: m.messagesInbox,
  sent: m.messagesSent,
};

const FOLDER_ICON = { inbox: Inbox, sent: Send };

export function MessagesPage({ search }: { search: MessagesSearch }) {
  const navigate = useNavigate();
  const { folder, q, message: openId, compose } = search;
  const { rows, unread } = useSuspenseQuery(messagesQuery({ folder, q })).data;

  const setSearch = (patch: Partial<MessagesSearch>, replace = false) => {
    void navigate({ to: ".", search: { ...search, ...patch }, replace });
  };

  return (
    <>
      <PageHeader
        title={m.messagesTitle()}
        description={
          unread > 0
            ? m.commMessagesUnreadCount({ count: formatNumber(unread) })
            : m.commMessagesAllRead()
        }
        actions={
          <Button onClick={() => setSearch({ compose: true })}>
            <SquarePen aria-hidden />
            {m.messagesCompose()}
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]">
        <div
          className={cn(
            "flex min-w-0 flex-col gap-4",
            openId && "hidden lg:flex",
          )}
        >
          <fieldset className="inline-flex w-fit gap-1 rounded-lg border border-border bg-muted/40 p-1">
            <legend className="sr-only">{m.commMessagesFolders()}</legend>
            {MESSAGE_FOLDERS.map((value) => {
              const FolderIcon = FOLDER_ICON[value];
              const active = value === folder;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSearch({ folder: value, message: "" })}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    active
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <FolderIcon className="size-4" aria-hidden />
                  {FOLDER_LABEL[value]()}
                  {value === "inbox" && unread > 0 ? (
                    <Badge>
                      <span aria-hidden>{formatNumber(unread)}</span>
                      <span className="sr-only">
                        {m.commMessagesUnreadCount({
                          count: formatNumber(unread),
                        })}
                      </span>
                    </Badge>
                  ) : null}
                </button>
              );
            })}
          </fieldset>

          <div className="relative">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              className="ps-9"
              value={q}
              aria-label={m.commMessagesSearchLabel()}
              placeholder={m.commMessagesSearchPlaceholder()}
              onChange={(event) => setSearch({ q: event.target.value }, true)}
            />
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={Mail}
              title={q ? m.commMessagesNoResults() : m.commonEmptyTitle()}
              body={q ? m.commSearchEmptyBody() : m.messagesEmpty()}
            />
          ) : (
            <ul className="flex flex-col gap-1">
              {rows.map((row) => {
                const selected = row.id === openId;
                // listMessages yields U+2014 when a sent message reached
                // nobody; Value says that in words instead.
                const counterpart =
                  row.counterpartName === "\u2014" ? "" : row.counterpartName;

                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setSearch({ message: row.id })}
                      aria-current={selected ? "true" : undefined}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2.5 text-start transition-colors",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        selected
                          ? "border-primary/40 bg-primary/5"
                          : "border-transparent hover:bg-muted",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        {row.unread ? (
                          <>
                            <span
                              className="size-2 shrink-0 rounded-full bg-primary"
                              aria-hidden
                            />
                            <span className="sr-only">
                              {m.messagesUnread()}
                            </span>
                          </>
                        ) : null}
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-sm",
                            row.unread ? "font-semibold" : "font-medium",
                          )}
                        >
                          <Value>{counterpart}</Value>
                        </span>
                        {row.attachmentCount > 0 ? (
                          <>
                            <Paperclip
                              className="size-3.5 shrink-0 text-muted-foreground"
                              aria-hidden
                            />
                            <span className="sr-only">
                              {m.commMessagesHasAttachments()}
                            </span>
                          </>
                        ) : null}
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatRelativeDays(row.sentAt.toISOString())}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "mt-1 block truncate text-sm",
                          row.unread
                            ? "text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {row.subject}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                        {row.preview}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className={cn("min-w-0", !openId && "hidden lg:block")}>
          {openId ? (
            <Suspense key={openId} fallback={<DetailSkeleton />}>
              <MessageDetail
                messageId={openId}
                onBack={() => setSearch({ message: "" })}
              />
            </Suspense>
          ) : (
            <EmptyState
              icon={Mail}
              title={m.commMessagesPickTitle()}
              body={m.commMessagesPickBody()}
            />
          )}
        </div>
      </div>

      <ComposeMessage
        open={compose}
        onOpenChange={(next) => setSearch({ compose: next })}
      />
    </>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
