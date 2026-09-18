import { useSuspenseQuery } from "@tanstack/react-query";
import { FilePenLine } from "lucide-react";

import { DirectoryPagination } from "~/components/admin/DirectoryPagination";
import { PageHeader, EmptyState } from "~/components/app/primitives";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { messageDraftsQuery } from "~/queries/message-drafts";
import { formatDateTime } from "~/utils/datetime";

export function MessageDrafts({
  page,
  onPage,
  onOpen,
  onClose,
}: {
  page: number;
  onPage: (page: number) => void;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const directory = useSuspenseQuery(messageDraftsQuery(page)).data;
  return (
    <>
      <PageHeader
        title={m.messageDrafts()}
        description={m.messageDraftsHint()}
        actions={
          <Button variant="outline" onClick={onClose}>
            {m.commMessagesBack()}
          </Button>
        }
      />
      <div className="rounded-xl border bg-card">
        {directory.rows.length ? (
          <ul className="divide-y">
            {directory.rows.map((draft) => (
              <li key={draft.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-4 p-5 text-start hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => onOpen(draft.id)}
                >
                  <FilePenLine
                    className="size-5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {draft.subject || m.messageUntitledDraft()}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {m.messageDraftUpdated({
                        date: formatDateTime(draft.updatedAt.toISOString()),
                      })}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={FilePenLine} title={m.messageNoDrafts()} />
        )}
        <div className="border-t p-4">
          <DirectoryPagination {...directory} onPage={onPage} />
        </div>
      </div>
    </>
  );
}
