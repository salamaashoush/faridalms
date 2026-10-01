import type { FileSummary } from "@faridalms/domain/file";

import {
  MESSAGE_ATTACHMENT_BYTES,
  MESSAGE_ATTACHMENT_LIMIT,
} from "@faridalms/domain/file";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { Textarea } from "@faridalms/ui/textarea";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import { ArrowLeft, Paperclip, SendHorizontal, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { FileField } from "~/components/system/FileField";
import { FileList } from "~/components/system/FileList";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { threadQuery } from "~/queries/messages";
import {
  markThreadRead,
  saveThreadDraft,
  sendMessage,
} from "~/server/messages";
import { getMessageFromError } from "~/utils/error";

import { dayHeading, dayOf, nameOf, threadTitle, timeOf } from "./format";
import { MembersSheet } from "./MembersSheet";

type Thread = Awaited<
  ReturnType<NonNullable<ReturnType<typeof threadQuery>["queryFn"]>>
>;
type Message = Thread["messages"][number];

function Bubble({
  message,
  own,
  showAuthor,
  seen,
  timeZone,
}: {
  message: Message;
  own: boolean;
  showAuthor: boolean;
  seen: number | null;
  timeZone: string;
}) {
  return (
    <li className={cn("flex", own ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "grid max-w-[85%] gap-1 sm:max-w-[70%]",
          own && "justify-items-end",
        )}
      >
        {showAuthor ? (
          <span className="px-1 text-[13px] leading-[18px] font-medium text-muted-foreground">
            {nameOf({
              fullNameEn: message.authorNameEn,
              fullNameAr: message.authorNameAr,
            })}
          </span>
        ) : null}
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2 text-sm leading-5 break-words whitespace-pre-wrap",
            own
              ? "rounded-ee-md bg-primary text-primary-foreground"
              : "rounded-es-md bg-muted",
          )}
          dir="auto"
        >
          {message.body}
        </div>
        {message.files.length ? (
          <div className="w-full min-w-56">
            <FileList files={message.files} />
          </div>
        ) : null}
        <span className="px-1 text-[12px] leading-4 text-muted-foreground">
          {timeOf(message.createdAt, timeZone)}
          {seen !== null && seen > 0
            ? ` · ${m.msgSeenBy({ count: seen })}`
            : null}
        </span>
      </div>
    </li>
  );
}

function Composer({ thread }: { thread: Thread }) {
  const hydrated = useHydrated();
  const queryClient = useQueryClient();
  const [text, setText] = useState(thread.draft ?? "");
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [attaching, setAttaching] = useState(false);
  const saved = useRef(thread.draft ?? "");
  const send = useMutation({
    mutationFn: () =>
      sendMessage({
        data: {
          threadId: thread.id,
          body: text.trim(),
          fileIds: files.map((file) => file.id),
        },
      }),
    meta: { inlineError: true },
  });
  const { mutate: keepDraft } = useMutation({
    mutationFn: (value: string) =>
      saveThreadDraft({ data: { threadId: thread.id, draft: value } }),
    meta: { inlineError: true },
  });
  useEffect(() => {
    if (text === saved.current) return undefined;
    const timer = setTimeout(() => {
      saved.current = text;
      keepDraft(text);
    }, 800);
    return () => clearTimeout(timer);
  }, [text, keepDraft]);
  const submit = () => {
    if (!text.trim() || send.isPending) return;
    void send.mutateAsync().then(
      async () => {
        saved.current = "";
        setText("");
        setFiles([]);
        setAttaching(false);
        await queryClient.invalidateQueries({ queryKey: ["messages"] });
      },
      () => undefined,
    );
  };
  return (
    <form
      className="grid gap-2 border-t bg-card p-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {attaching ? (
        <FileField
          id="message-files"
          label={m.msgAttachments()}
          optional
          purpose="attachment"
          value={files}
          onChange={(update) => setFiles(update)}
          maxFiles={MESSAGE_ATTACHMENT_LIMIT}
          maxBytes={MESSAGE_ATTACHMENT_BYTES}
        />
      ) : null}
      {send.error ? (
        <p role="alert" className="text-[13px] leading-[18px] text-destructive">
          {getMessageFromError(send.error)}
        </p>
      ) : null}
      <div className="flex items-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 max-md:size-10"
          aria-label={m.msgAttach()}
          aria-pressed={attaching}
          onClick={() => setAttaching(!attaching)}
        >
          <Paperclip aria-hidden />
        </Button>
        <label htmlFor="message-body" className="sr-only">
          {m.msgWrite()}
        </label>
        <Textarea
          id="message-body"
          dir="auto"
          rows={1}
          maxLength={5000}
          placeholder={m.msgWritePlaceholder()}
          className="max-h-40 min-h-9 resize-none py-2"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <Button
          type="submit"
          size="icon"
          className="shrink-0 max-md:size-10"
          aria-label={m.msgSend()}
          disabled={!hydrated || !text.trim() || send.isPending}
        >
          <SendHorizontal className="rtl:rotate-180" aria-hidden />
        </Button>
      </div>
    </form>
  );
}

/** One conversation: messages grouped by day, the composer underneath. */
export function Conversation({
  threadId,
  onBack,
}: {
  threadId: string;
  onBack: () => void;
}) {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const thread = useSuspenseQuery(threadQuery(threadId)).data;
  const [membersOpen, setMembersOpen] = useState(false);
  const end = useRef<HTMLLIElement>(null);
  const { mutate: markRead } = useMutation({
    mutationFn: () => markThreadRead({ data: { threadId } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["messages", "inbox"] }),
  });
  const lastId = thread.messages.at(-1)?.id;
  useEffect(() => {
    if (!lastId) return;
    markRead();
    end.current?.scrollIntoView({ block: "end" });
  }, [lastId, markRead]);
  const others = thread.members.filter((row) => row.userId !== user.id);
  const title = threadTitle({ subject: thread.subject, others });
  const timeZone = user.school.timeZone;
  const lastOwn = thread.messages
    .toReversed()
    .find((message) => message.authorId === user.id);
  const seenBy = (message: Message) =>
    thread.showsSeen && message.id === lastOwn?.id
      ? others.filter(
          (member) =>
            member.lastReadAt !== null &&
            member.lastReadAt >= message.createdAt,
        ).length
      : null;
  return (
    <section
      aria-label={title}
      className="grid h-full min-h-[28rem] grid-rows-[auto_minmax(0,1fr)_auto]"
    >
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="max-md:size-10 lg:hidden"
          aria-label={m.msgBack()}
          onClick={onBack}
        >
          <ArrowLeft className="rtl:rotate-180" aria-hidden />
        </Button>
        <div className="grid min-w-0 flex-1">
          <h2 className="truncate text-base leading-6 font-semibold">
            {title}
          </h2>
          {thread.student ? (
            <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
              {m.msgAbout({ name: nameOf(thread.student) })}
            </span>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          className="max-md:h-10"
          onClick={() => setMembersOpen(true)}
        >
          <Users aria-hidden />
          <span className="tabular-nums">{thread.members.length}</span>
          <span className="sr-only">{m.msgMembers()}</span>
        </Button>
      </header>
      <ol
        className="grid content-start gap-3 overflow-y-auto p-4"
        aria-label={m.msgMessages()}
      >
        {thread.messages.flatMap((message, index) => {
          const day = dayOf(message.createdAt, timeZone);
          const before = thread.messages[index - 1];
          const heading =
            before && dayOf(before.createdAt, timeZone) === day ? null : (
              <li
                key={`day-${day}`}
                className="py-1 text-center text-[12px] font-medium text-muted-foreground"
              >
                {dayHeading(day, user.today)}
              </li>
            );
          const own = message.authorId === user.id;
          return [
            ...(heading ? [heading] : []),
            <Bubble
              key={message.id}
              message={message}
              own={own}
              showAuthor={!own && thread.members.length > 2}
              seen={seenBy(message)}
              timeZone={timeZone}
            />,
          ];
        })}
        <li ref={end} aria-hidden className="h-px" />
      </ol>
      <Composer key={thread.id} thread={thread} />
      {membersOpen ? (
        <MembersSheet thread={thread} onClose={() => setMembersOpen(false)} />
      ) : null}
    </section>
  );
}
