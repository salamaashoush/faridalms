import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeft, Paperclip } from "lucide-react";

import { Field, FieldGrid, Value } from "~/components/app/primitives";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { messageQuery } from "~/queries/school";
import { formatDateTime } from "~/utils/datetime";

interface Attachment {
  id: string;
  name: string;
  sizeBytes: number;
}

const SIZE_UNITS = ["byte", "kilobyte", "megabyte", "gigabyte"] as const;

function formatFileSize(bytes: number): string {
  let value = bytes;
  let step = 0;
  while (value >= 1024 && step < SIZE_UNITS.length - 1) {
    value /= 1024;
    step += 1;
  }
  return new Intl.NumberFormat(getLocale(), {
    style: "unit",
    unit: SIZE_UNITS[step] ?? "byte",
    unitDisplay: "short",
    maximumFractionDigits: step > 0 && value < 10 ? 1 : 0,
  }).format(value);
}

function AttachmentList({ files }: { files: Attachment[] }) {
  if (files.length === 0) {
    return null;
  }

  return (
    <section>
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {m.messagesAttachments()}
      </h3>
      <ul className="mt-2 flex flex-col gap-2">
        {files.map((file) => (
          <li
            key={file.id}
            className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2"
          >
            <Paperclip
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {formatFileSize(file.sizeBytes)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MessageDetail({
  messageId,
  onBack,
}: {
  messageId: string;
  onBack: () => void;
}) {
  const message = useSuspenseQuery(messageQuery(messageId)).data;
  const student = message.student
    ? `${message.student.firstName} ${message.student.lastName}`
    : "";

  return (
    <article className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="-ms-2 mb-2 lg:hidden"
          onClick={onBack}
        >
          <ChevronLeft className="rtl:rotate-180" aria-hidden />
          {m.commMessagesBack()}
        </Button>
        <h2 className="text-lg font-semibold text-balance">
          {message.subject}
        </h2>
      </div>

      <FieldGrid>
        <Field label={m.messagesFrom()}>{message.sender?.name}</Field>
        <Field label={m.messagesTo()}>
          {message.recipients
            .map((link) => link.recipient?.name ?? "")
            .filter((name) => name !== "")
            .join(", ")}
        </Field>
        <Field label={m.messagesDate()}>
          {formatDateTime(message.sentAt.toISOString())}
        </Field>
        <Field label={m.messagesAbout()}>{student}</Field>
      </FieldGrid>

      <p className="text-sm leading-relaxed whitespace-pre-line">
        {message.body}
      </p>

      <AttachmentList files={message.attachments} />

      {message.replies.length > 0 ? (
        <section>
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {m.messagesReplies()}
          </h3>
          <ol className="mt-3 flex flex-col gap-4 border-s-2 border-border ps-4">
            {message.replies.map((reply) => (
              <li key={reply.id} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">
                    <Value>{reply.sender?.name}</Value>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(reply.sentAt.toISOString())}
                  </span>
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-line">
                  {reply.body}
                </p>
                <AttachmentList files={reply.attachments} />
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </article>
  );
}
