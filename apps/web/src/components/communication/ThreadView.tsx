import type { FileSummary } from "@faridalms/database/repositories/files";
import type { ContentDocument } from "@faridalms/domain/content";

import { emptyContent } from "@faridalms/domain/content-conversion";
import {
  MESSAGE_ATTACHMENT_BYTES,
  MESSAGE_ATTACHMENT_LIMIT,
} from "@faridalms/domain/file";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, useHydrated } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, Paperclip, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { getMessage } from "~/server/school";

import { PersonAvatar } from "~/components/admin/PersonAvatar";
import { Value } from "~/components/app/primitives";
import { fileSizeLabel } from "~/components/assignments/FileList";
import { FileUploader } from "~/components/assignments/FileUploader";
import { ContentEditor } from "~/components/content/ContentEditor";
import { ContentView } from "~/components/content/ContentView";
import { MarkdownContent } from "~/components/records/MarkdownContent";
import { Button } from "~/components/ui/button";
import { useCurrentUser, useCapability } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { messageQuery } from "~/queries/school";
import { replyMessage } from "~/server/school";
import { cn } from "~/utils/cn";
import { formatDateTime, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

type Thread = Awaited<ReturnType<typeof getMessage>>;
type Attachment = Thread["attachments"][number];
type Item = Omit<Thread["replies"][number], "recipients"> & {
  recipients?: Thread["recipients"];
};

function AttachmentList({ files }: { files: Attachment[] }) {
  if (files.length === 0) return null;
  return (
    <ul
      className="mt-3 flex flex-col gap-2"
      aria-label={m.messagesAttachments()}
    >
      {files.map((file) => (
        <li
          key={file.id}
          className="flex items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2"
        >
          <Paperclip
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          {file.file ? (
            <a
              href={`/files/${file.file.id}`}
              download={file.name}
              className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
            >
              {file.name}
            </a>
          ) : (
            <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
          )}
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {fileSizeLabel(file.sizeBytes)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Body({ item }: { item: Item }) {
  if (item.bodyFormat === "rich" && item.document)
    return <ContentView document={item.document} />;
  if (item.bodyFormat === "markdown")
    return <MarkdownContent>{item.body}</MarkdownContent>;
  return (
    <p className="text-sm leading-relaxed whitespace-pre-line">{item.body}</p>
  );
}

function Bubble({
  item,
  own,
  focused,
  readBy,
}: {
  item: Item;
  own: boolean;
  focused: boolean;
  readBy?: { read: number; total: number };
}) {
  return (
    <li
      id={`message-${item.id}`}
      className={cn(
        "flex gap-3 rounded-xl border p-4 sm:p-5",
        own ? "border-primary/20 bg-primary/5" : "bg-card",
        focused && "ring-2 ring-ring/30",
      )}
    >
      <PersonAvatar name={item.sender?.name ?? ""} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-sm font-semibold">
            {item.sender ? (
              <Link
                to="/people/$userId"
                params={{ userId: item.sender.id }}
                className="hover:text-primary hover:underline"
              >
                {item.sender.name}
              </Link>
            ) : (
              <Value>{null}</Value>
            )}
            {own ? (
              <span className="ms-2 text-xs font-normal text-muted-foreground">
                {m.messageYou()}
              </span>
            ) : null}
          </span>
          <time
            dateTime={item.sentAt.toISOString()}
            className="text-xs text-muted-foreground"
          >
            {formatDateTime(item.sentAt.toISOString())}
          </time>
        </div>
        <div className="mt-3" dir="auto">
          <Body item={item} />
        </div>
        <AttachmentList files={item.attachments} />
        {readBy ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {m.messageReadBy({
              read: formatNumber(readBy.read),
              total: formatNumber(readBy.total),
            })}
          </p>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Sends into the same conversation the reader is looking at: the URL does not
 * change, the list of messages grows in place, and the composer empties.
 */
function ReplyComposer({ threadId }: { threadId: string }) {
  const hydrated = useHydrated();
  const queryClient = useQueryClient();
  const reply = useServerFn(replyMessage);
  const [document, setDocument] = useState<ContentDocument>(emptyContent);
  const [valid, setValid] = useState(true);
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [editorKey, setEditorKey] = useState(0);
  const [failure, setFailure] = useState<string>();
  const onDocument = useCallback(
    (value: ContentDocument) => setDocument(value),
    [],
  );
  const onValidity = useCallback((next: boolean) => setValid(next), []);
  const mutation = useMutation({
    mutationFn: () =>
      reply({
        data: {
          id: threadId,
          body: "",
          bodyFormat: "rich",
          document,
          fileIds: files.map((file) => file.id),
        },
      }),
    onSuccess: async () => {
      setFailure(undefined);
      setDocument(emptyContent());
      setFiles([]);
      setEditorKey((key) => key + 1);
      toast.success(m.messagesSentToast());
      await queryClient.invalidateQueries({ queryKey: ["messages"] });
    },
    onError: (error) => setFailure(getMessageFromError(error)),
  });
  return (
    <form
      className="space-y-3 border-t pt-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) mutation.mutate();
      }}
    >
      <fieldset
        disabled={!hydrated || mutation.isPending}
        className="min-w-0 space-y-3"
      >
        <ContentEditor
          key={editorKey}
          id="message-reply"
          label={m.messagesWriteReply()}
          value={document}
          onChange={onDocument}
          onValidityChange={onValidity}
          disabled={mutation.isPending}
        />
        <FileUploader
          label={m.messagesAttachFiles()}
          purpose="message_attachment"
          value={files}
          onChange={setFiles}
          maxFiles={MESSAGE_ATTACHMENT_LIMIT}
          maxBytes={MESSAGE_ATTACHMENT_BYTES}
          disabled={mutation.isPending}
        />
      </fieldset>
      {failure ? (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={!hydrated || !valid || mutation.isPending}
        >
          <Send className="size-4" aria-hidden />
          {mutation.isPending ? m.commonSending() : m.messagesSendReply()}
        </Button>
      </div>
    </form>
  );
}

export function ThreadView({
  messageId,
  onBack,
}: {
  messageId: string;
  onBack: () => void;
}) {
  const canSend = useCapability("messages:send");
  const user = useCurrentUser();
  const thread = useSuspenseQuery(messageQuery(messageId)).data;
  const focused = useRef(false);
  useEffect(() => {
    if (focused.current || thread.focusId === thread.id) return;
    focused.current = true;
    document
      .getElementById(`message-${thread.focusId}`)
      ?.scrollIntoView({ block: "center" });
  }, [thread.focusId, thread.id]);
  const student = thread.student
    ? `${thread.student.firstName} ${thread.student.lastName}`
    : "";
  const items: Item[] = [thread, ...thread.replies];
  const others = thread.participants.filter((person) => person.id !== user.id);
  return (
    <article className="flex min-h-full flex-col gap-6 p-5 sm:p-6">
      <header>
        <Button
          variant="ghost"
          size="sm"
          className="-ms-2 mb-2 lg:hidden"
          onClick={onBack}
        >
          <ChevronLeft className="rtl:rotate-180" aria-hidden />
          {m.commMessagesBack()}
        </Button>
        <h2 className="text-lg font-semibold text-balance">{thread.subject}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {m.messageThreadWith({
            names: others.map((person) => person.name).join(", "),
          })}
          {student ? ` · ${m.messageThreadAbout({ student })}` : ""}
          {" · "}
          {m.messageThreadCount({ count: formatNumber(items.length) })}
        </p>
      </header>
      <ol className="flex flex-col gap-4" aria-label={m.messagesTitle()}>
        {items.map((item) => (
          <Bubble
            key={item.id}
            item={item}
            own={item.senderId === user.id}
            focused={item.id === thread.focusId && thread.focusId !== thread.id}
            readBy={
              item.id === thread.id && thread.senderId === user.id
                ? {
                    read: thread.recipients.filter((link) => link.readAt)
                      .length,
                    total: thread.recipients.length,
                  }
                : undefined
            }
          />
        ))}
      </ol>
      {canSend ? <ReplyComposer key={thread.id} threadId={thread.id} /> : null}
    </article>
  );
}
