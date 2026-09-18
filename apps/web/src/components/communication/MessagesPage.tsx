import {
  MESSAGE_FOLDERS,
  messagesQuerySchema,
} from "@faridalms/domain/school-schema";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Inbox, Mail, Paperclip, Search, Send, SquarePen } from "lucide-react";
import { Suspense } from "react";
import * as v from "valibot";

import { DirectoryPagination } from "~/components/admin/DirectoryPagination";
import { EmptyState, PageHeader, Value } from "~/components/app/primitives";
import { ComposeMessage } from "~/components/communication/ComposeMessage";
import { MessageDetail } from "~/components/communication/MessageDetail";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { usePermission } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { messageDraftQuery } from "~/queries/message-drafts";
import { messagesQuery } from "~/queries/school";
import { cn } from "~/utils/cn";
import { formatNumber, formatRelativeDays } from "~/utils/datetime";

import { MessageDrafts } from "./MessageDrafts";

/**
 * The server contract plus the two things the two-pane layout needs: which
 * message is open, and whether the composer is showing. Both belong in the URL
 * so a link to a message opens that message.
 */
export const messagesSearchSchema = v.object({
  ...messagesQuerySchema.entries,
  message: v.optional(v.string(), ""),
  compose: v.optional(v.boolean(), false),
  drafts: v.optional(v.boolean(), false),
  draft: v.optional(v.union([v.literal(""), v.pipe(v.string(), v.uuid())]), ""),
});
export type MessagesSearch = v.InferOutput<typeof messagesSearchSchema>;

const FOLDER_LABEL: Record<(typeof MESSAGE_FOLDERS)[number], () => string> = {
  inbox: m.messagesInbox,
  sent: m.messagesSent,
};

const FOLDER_ICON = { inbox: Inbox, sent: Send };

export function MessagesPage({ search }: { search: MessagesSearch }) {
  const navigate = useNavigate();
  const canSend = usePermission("messages:send");
  const { folder, q, message: openId, compose } = search;
  const { rows, unread, page, pages, total } = useSuspenseQuery(
    messagesQuery({ folder, q, page: search.page }),
  ).data;

  const setSearch = (patch: Partial<MessagesSearch>, replace = false) => {
    void navigate({ to: ".", search: { ...search, ...patch }, replace });
  };

  if (compose && canSend) {
    return (
      <DraftComposer
        key={search.draft || "new"}
        draftId={search.draft}
        onSaved={(id) => setSearch({ draft: id }, true)}
        onClose={() => setSearch({ compose: false, draft: "" })}
        onSent={(id) =>
          setSearch({
            compose: false,
            drafts: false,
            draft: "",
            folder: "sent",
            message: id,
            q: "",
            page: 1,
          })
        }
      />
    );
  }

  if (search.drafts && canSend)
    return (
      <MessageDrafts
        page={search.page}
        onPage={(next) => setSearch({ page: next })}
        onOpen={(id) => setSearch({ draft: id, compose: true, drafts: false })}
        onClose={() => setSearch({ drafts: false, page: 1 })}
      />
    );

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
          canSend ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setSearch({ drafts: true, page: 1 })}
              >
                {m.messageDrafts()}
              </Button>
              <Button onClick={() => setSearch({ compose: true, draft: "" })}>
                <SquarePen aria-hidden />
                {m.messagesCompose()}
              </Button>
            </div>
          ) : null
        }
      />

      <div className="grid overflow-hidden rounded-xl border bg-card lg:min-h-[36rem] lg:grid-cols-[20rem_minmax(0,1fr)] xl:h-[calc(100dvh-13rem)] xl:grid-cols-[10rem_20rem_minmax(0,1fr)]">
        <aside className="border-b bg-muted/20 p-3 lg:col-span-2 xl:col-span-1 xl:border-e xl:border-b-0">
          <fieldset className="flex gap-1 xl:flex-col">
            <legend className="sr-only">{m.commMessagesFolders()}</legend>
            {MESSAGE_FOLDERS.map((value) => {
              const FolderIcon = FOLDER_ICON[value];
              const active = value === folder;
              return (
                <Button
                  variant="ghost"
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setSearch({ folder: value, message: "", page: 1 })
                  }
                  className={cn(
                    "h-9 justify-start gap-2 px-3 text-sm font-medium",
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
                </Button>
              );
            })}
          </fieldset>
        </aside>
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-col lg:border-e",
            openId && "hidden lg:flex",
          )}
        >
          <div className="relative border-b p-3">
            <Search
              className="pointer-events-none absolute start-6 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              className="h-9 ps-9"
              value={q}
              aria-label={m.commMessagesSearchLabel()}
              placeholder={m.commMessagesSearchPlaceholder()}
              onChange={(event) =>
                setSearch({ q: event.target.value, page: 1 }, true)
              }
            />
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={Mail}
              title={q ? m.commMessagesNoResults() : m.commonEmptyTitle()}
              body={q ? m.commSearchEmptyBody() : m.messagesEmpty()}
            />
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto">
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
                        "w-full border-b px-4 py-4 text-start transition-colors",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        selected ? "bg-accent" : "hover:bg-muted/50",
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
          <div className="mt-auto border-t p-3">
            <DirectoryPagination
              page={page}
              pages={pages}
              total={total}
              onPage={(next) => setSearch({ page: next, message: "" })}
            />
          </div>
        </div>

        <div
          className={cn(
            "min-h-0 min-w-0 overflow-y-auto",
            !openId && "hidden lg:flex lg:items-center lg:justify-center",
          )}
        >
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

function DraftComposer({
  draftId,
  ...props
}: {
  draftId: string;
  onSaved: (id: string) => void;
  onSent: (id: string) => void;
  onClose: () => void;
}) {
  return draftId ? (
    <ResumeDraft draftId={draftId} {...props} />
  ) : (
    <ComposeMessage {...props} />
  );
}
function ResumeDraft({
  draftId,
  ...props
}: {
  draftId: string;
  onSaved: (id: string) => void;
  onSent: (id: string) => void;
  onClose: () => void;
}) {
  const { data } = useSuspenseQuery(messageDraftQuery(draftId));
  return <ComposeMessage initial={data} {...props} />;
}
