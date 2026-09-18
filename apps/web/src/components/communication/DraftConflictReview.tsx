import type { ComposeMessageInput } from "@faridalms/domain/school-schema";

import type { getMessageDraft } from "~/server/message-drafts";

import { Field, FieldGrid, Value } from "~/components/app/primitives";
import { MarkdownContent } from "~/components/records/MarkdownContent";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";

type Draft = Awaited<ReturnType<typeof getMessageDraft>>;

function DraftVersion({
  title,
  subject,
  body,
  bodyFormat,
  recipient,
  student,
  categoryLabel,
}: {
  title: string;
  subject: string;
  body: string;
  bodyFormat?: "plain" | "markdown";
  recipient: string;
  student: string;
  categoryLabel: string;
}) {
  return (
    <section className="min-w-0 rounded-xl border bg-card p-5 sm:p-6">
      <h3 className="mb-5 font-semibold">{title}</h3>
      <FieldGrid>
        <Field label={m.commComposeCategory()}>{categoryLabel}</Field>
        <Field label={m.messagesSubject()}>{subject}</Field>
        <Field label={m.messagesRecipient()}>{recipient}</Field>
        <Field label={m.messagesAbout()}>{student}</Field>
      </FieldGrid>
      <div className="mt-6 border-t pt-5">
        {body && bodyFormat === "markdown" ? (
          <MarkdownContent>{body}</MarkdownContent>
        ) : (
          <p className="text-sm whitespace-pre-wrap">
            <Value>{body}</Value>
          </p>
        )}
      </div>
    </section>
  );
}

export function DraftConflictReview({
  local,
  latest,
  localRecipient,
  localStudent,
  latestStudent,
  pending,
  failure,
  localCategory,
  latestCategory,
  onRefresh,
  onCancel,
  onUseSaved,
  onSaveLocal,
}: {
  local: ComposeMessageInput;
  latest: Draft;
  localCategory: string;
  latestCategory: string;
  onRefresh: () => Promise<void>;
  localRecipient: string;
  localStudent: string;
  latestStudent: string;
  pending: boolean;
  failure?: string;
  onCancel: () => void;
  onUseSaved: () => void;
  onSaveLocal: () => Promise<void>;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">{m.messageReviewVersions()}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {latest.sentMessageId
            ? m.messageDraftAlreadySent()
            : m.messageReviewVersionsHint()}
        </p>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <DraftVersion
          {...local}
          title={m.messageYourVersion()}
          categoryLabel={localCategory}
          recipient={localRecipient}
          student={localStudent}
        />
        <DraftVersion
          {...latest}
          title={m.messageSavedVersion({ revision: latest.revision })}
          categoryLabel={latestCategory}
          recipient={latest.recipient?.name ?? ""}
          student={latestStudent}
        />
      </div>
      {failure ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {failure}
        </p>
      ) : null}
      <div className="sticky bottom-0 flex flex-wrap justify-end gap-3 rounded-xl border bg-background/95 p-4 backdrop-blur-sm">
        <Button variant="ghost" disabled={pending} onClick={onRefresh}>
          {m.messageRefreshVersion()}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={onCancel}>
          {m.editorKeepEditing()}
        </Button>
        <Button variant="outline" disabled={pending} onClick={onUseSaved}>
          {latest.sentMessageId
            ? m.messageOpenSent()
            : m.messageUseSavedVersion()}
        </Button>
        <Button disabled={pending} onClick={onSaveLocal}>
          {pending
            ? m.teachSaving()
            : latest.sentMessageId
              ? m.messageSaveNewDraft()
              : m.messageSaveMyVersion()}
        </Button>
      </div>
    </div>
  );
}
