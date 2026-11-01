import type { ContentDocument } from "@faridalms/domain/content";
import type { EntryKind, WrittenKind } from "@faridalms/domain/messages";
import type { ReactNode } from "react";

import { contentPlainText } from "@faridalms/domain/content";
import {
  emptyContent,
  fillFields,
  plainContent,
} from "@faridalms/domain/content-conversion";
import { hasWords, LOGGED_CONTACTS } from "@faridalms/domain/messages";
import { messageFields } from "@faridalms/domain/templates";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import { ArrowLeft, Mail, SendHorizontal, Users } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { ContentEditor } from "~/components/content/ContentEditor";
import { ContentView } from "~/components/content/ContentView";
import { TemplatePicker } from "~/components/content/Templates";
import { useDocumentMedia } from "~/components/coursework/useDocumentMedia";
import { SelectField } from "~/components/system/field";
import { Segmented } from "~/components/system/panel";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { threadQuery } from "~/queries/messages";
import {
  markThreadRead,
  saveThreadDraft,
  sendMessage,
} from "~/server/messages";
import { getMessageFromError } from "~/utils/error";

import { ENTRY_ICON, entryTitle } from "./entries";
import { dayHeading, dayOf, nameOf, threadTitle, timeOf } from "./format";
import { MembersSheet } from "./MembersSheet";

type Thread = Awaited<
  ReturnType<NonNullable<ReturnType<typeof threadQuery>["queryFn"]>>
>;
type Entry = Thread["messages"][number];

const fileUrl = (fileId: string) => `/files/${fileId}`;

/** What an entry says: its document, or for one written before documents, its text. */
function Words({ entry, fit = false }: { entry: Entry; fit?: boolean }) {
  if (entry.redacted)
    return (
      <p className="text-sm leading-5 text-muted-foreground italic">
        {m.msgRemoved()}
      </p>
    );
  const document =
    entry.content ?? (entry.body ? plainContent(entry.body) : null);
  if (!document) return null;
  const view = <ContentView document={document} fileUrl={fileUrl} />;
  // A document measures itself against its container, so it has no width
  // of its own; a bubble of words takes the width of its text, measured by
  // the text laid out unseen beside it. One holding a file or a picture
  // takes the room it is given.
  const words = (document.root.children ?? []).every(
    (node) => node.type === "paragraph",
  );
  if (!fit || !words)
    return (
      <div dir="auto" className="text-sm leading-5 break-words">
        {view}
      </div>
    );
  return (
    <div dir="auto" className="grid text-sm leading-5 break-words">
      <span
        aria-hidden
        data-measure={entry.body}
        className="invisible col-start-1 row-start-1 h-0 overflow-hidden whitespace-pre-wrap after:content-[attr(data-measure)]"
      />
      <div className="col-start-1 row-start-1 min-w-0">{view}</div>
    </div>
  );
}

function Bubble({
  entry,
  own,
  showAuthor,
  seen,
  timeZone,
}: {
  entry: Entry;
  own: boolean;
  showAuthor: boolean;
  seen: number | null;
  timeZone: string;
}) {
  return (
    <li className={cn("flex", own ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "flex w-full max-w-[85%] flex-col items-start gap-1 sm:max-w-[70%]",
          own && "items-end",
        )}
      >
        {showAuthor ? (
          <span className="px-1 text-[13px] leading-[18px] font-medium text-muted-foreground">
            <bdi>
              {nameOf({
                fullNameEn: entry.authorNameEn,
                fullNameAr: entry.authorNameAr,
              })}
            </bdi>
          </span>
        ) : null}
        <div
          className={cn(
            "max-w-full rounded-2xl px-3.5 py-2",
            own
              ? "rounded-ee-md bg-primary text-primary-foreground [--fe-accent:var(--primary-foreground)] [--foreground:var(--primary-foreground)]"
              : "rounded-es-md bg-muted",
          )}
        >
          <Words entry={entry} fit />
        </div>
        <span className="flex items-center gap-1 px-1 text-[12px] leading-4 text-muted-foreground">
          {entry.authorContactId ? (
            <>
              <Mail aria-hidden className="size-3" />
              <span>{m.msgByEmail()}</span>
              <span aria-hidden>·</span>
            </>
          ) : null}
          {timeOf(entry.createdAt, timeZone)}
          {seen !== null && seen > 0
            ? ` · ${m.msgSeenBy({ count: seen })}`
            : null}
        </span>
      </div>
    </li>
  );
}

/**
 * An entry only the team reads: a note, a contact logged, a recorded
 * change, or mail held back. Laid across the conversation rather than as a
 * bubble, and marked internal, so nobody mistakes it for something the
 * family was sent.
 */
function InternalEntry({
  entry,
  mailbox,
  timeZone,
}: {
  entry: Entry & { kind: Exclude<EntryKind, "message"> };
  mailbox: Thread["mailbox"];
  timeZone: string;
}) {
  const Icon = ENTRY_ICON[entry.kind];
  const title = entryTitle(mailbox, entry.kind, entry.details);
  const author = nameOf({
    fullNameEn: entry.authorNameEn,
    fullNameAr: entry.authorNameAr,
  });
  if (entry.kind === "event")
    return (
      <li className="flex items-center justify-center gap-2 py-1 text-center text-[13px] leading-[18px] text-muted-foreground">
        <Icon aria-hidden className="size-3.5 shrink-0" />
        <span>
          {title}
          {author ? (
            <>
              {" · "}
              <bdi>{author}</bdi>
            </>
          ) : null}
          {" · "}
          {timeOf(entry.createdAt, timeZone)}
        </span>
        {entry.body ? (
          <span dir="auto" className="sr-only">
            {entry.body}
          </span>
        ) : null}
      </li>
    );
  return (
    <li
      className={cn(
        "grid gap-1 rounded-lg border border-dashed px-3 py-2",
        entry.kind === "held" ? "border-warning bg-warning/5" : "bg-muted/40",
      )}
    >
      <p className="flex flex-wrap items-center gap-x-2 text-[13px] leading-[18px]">
        <Icon aria-hidden className="size-3.5 shrink-0" />
        <span className="font-medium">{title}</span>
        <span className="rounded-sm bg-muted px-1.5 text-[11px] leading-[18px] font-medium text-muted-foreground">
          {m.msgInternal()}
        </span>
        <span className="text-muted-foreground">
          {author ? (
            <>
              <bdi>{author}</bdi>
              {" · "}
            </>
          ) : null}
          {timeOf(entry.createdAt, timeZone)}
        </span>
      </p>
      <Words entry={entry} />
    </li>
  );
}

type Mode = "message" | "note" | "logged";

/**
 * Writes into the conversation. A team writes a message to everyone, a
 * note for each other, or a call, meeting or email that happened outside
 * the app; anyone else writes a message. A message someone overtook is
 * held back until the writer has read what came in, or sends it anyway.
 */
function Composer({
  thread,
  fields,
}: {
  thread: Thread;
  fields?: { child?: string };
}) {
  const hydrated = useHydrated();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const id = useId();
  const media = useDocumentMedia(undefined);
  const [content, setContent] = useState<ContentDocument>(() =>
    thread.draft ? plainContent(thread.draft) : emptyContent(),
  );
  const [replace, setReplace] = useState<{
    to: ContentDocument;
    at: number;
  }>();
  const [mode, setMode] = useState<Mode>("message");
  const [logged, setLogged] =
    useState<(typeof LOGGED_CONTACTS)[number]>("call");
  const [uploading, setUploading] = useState(false);
  const [overtaken, setOvertaken] = useState(false);
  const saved = useRef(thread.draft ?? "");
  const kind: WrittenKind =
    mode === "logged" ? logged : mode === "note" ? "note" : "message";
  const send = useMutation({
    mutationFn: (force: boolean) =>
      sendMessage({
        data: {
          threadId: thread.id,
          content,
          kind,
          after: thread.latestId ?? "",
          force,
        },
      }),
    meta: { inlineError: true },
  });
  const { mutate: keepDraft } = useMutation({
    mutationFn: (value: string) =>
      saveThreadDraft({ data: { threadId: thread.id, draft: value } }),
    meta: { inlineError: true },
  });
  const text = contentPlainText(content);
  useEffect(() => {
    if (text === saved.current || text.length > 5000) return undefined;
    const timer = setTimeout(() => {
      saved.current = text;
      keepDraft(text);
    }, 800);
    return () => clearTimeout(timer);
  }, [text, keepDraft]);
  const clear = () => {
    saved.current = "";
    setContent(emptyContent());
    setReplace({ to: emptyContent(), at: Date.now() });
  };
  const submit = (force = false) => {
    if (!hasWords(content) || send.isPending || uploading) return;
    setOvertaken(false);
    void send.mutateAsync(force).then(
      async () => {
        clear();
        await queryClient.invalidateQueries({ queryKey: ["messages"] });
        await queryClient.invalidateQueries({ queryKey: ["admissions"] });
      },
      (error: unknown) => {
        if (getMessageFromError(error) === m.msgNewer()) setOvertaken(true);
      },
    );
  };
  const outside = thread.members.find((member) => member.outside);
  const insert = (template: ContentDocument) => {
    const locale = /[؀-ۿ]/.test(contentPlainText(template)) ? "ar" : "en";
    const filled = fillFields(
      template,
      messageFields(locale, {
        name: outside ? nameOf(outside) : "",
        child: fields?.child ?? "",
        school: user.school.name,
        sender: user.name,
      }),
    );
    setContent(filled);
    setReplace({ to: filled, at: Date.now() });
  };
  const label =
    mode === "note"
      ? m.msgWriteNote()
      : mode === "logged"
        ? m.msgWriteLogged()
        : m.msgWrite();
  return (
    <form
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 border-t bg-card p-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {thread.canNote ? (
        <div className="flex flex-wrap items-end gap-2">
          <Segmented
            label={m.msgComposeAs()}
            value={mode}
            options={[
              { value: "message", label: m.msgModeMessage() },
              { value: "note", label: m.msgModeNote() },
              { value: "logged", label: m.msgModeLogged() },
            ]}
            onChange={setMode}
          />
          {mode === "logged" ? (
            <SelectField
              id={`${id}-logged`}
              label={m.msgLoggedKind()}
              value={logged}
              options={LOGGED_CONTACTS.map((value) => ({
                value,
                label: entryTitle(thread.mailbox, value, {}),
              }))}
              onChange={(value) => setLogged(value)}
            />
          ) : null}
          {mode === "message" ? (
            <div className="ms-auto">
              <TemplatePicker kind="message" onApply={insert} />
            </div>
          ) : null}
        </div>
      ) : null}
      {mode === "message" && thread.emailsOutside ? (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.msgGoesByEmail()}
        </p>
      ) : null}
      {mode !== "message" ? (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.msgInternalHint()}
        </p>
      ) : null}
      <ContentEditor
        id={`${id}-body`}
        label={label}
        placeholder={mode === "message" ? m.msgWritePlaceholder() : label}
        value={content}
        onChange={setContent}
        onUploadingChange={setUploading}
        media={media}
        replace={replace}
      />
      {overtaken ? (
        <div
          role="alert"
          className="grid gap-2 rounded-lg border border-warning bg-warning/5 p-3 text-sm leading-5"
        >
          <p>{m.msgNewer()}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="max-md:h-10"
              onClick={() => {
                setOvertaken(false);
                void queryClient.invalidateQueries({
                  queryKey: ["messages", "thread", thread.id],
                });
              }}
            >
              {m.msgShowNewer()}
            </Button>
            <Button
              type="button"
              className="max-md:h-10"
              onClick={() => submit(true)}
            >
              {m.msgSendAnyway()}
            </Button>
          </div>
        </div>
      ) : send.error ? (
        <p role="alert" className="text-[13px] leading-[18px] text-destructive">
          {getMessageFromError(send.error)}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button
          type="submit"
          className="max-md:h-10"
          disabled={
            !hydrated || !hasWords(content) || uploading || send.isPending
          }
        >
          <SendHorizontal className="rtl:rotate-180" aria-hidden />
          {mode === "message" ? m.msgSend() : m.msgSave()}
        </Button>
      </div>
    </form>
  );
}

/**
 * One conversation: its entries grouped by day, the composer underneath.
 * A page that belongs to a conversation, such as an enquiry's, draws it
 * here too, so writing from either is the same action.
 */
export function Conversation({
  threadId,
  onBack,
  embedded = false,
  fields,
  header,
}: {
  threadId: string;
  onBack?: () => void;
  /** Drawn within a record's page rather than as Messages' second pane. */
  embedded?: boolean;
  /** What a template's fields are filled with beyond the conversation's own. */
  fields?: { child?: string };
  header?: ReactNode;
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
    if (!embedded) end.current?.scrollIntoView({ block: "end" });
  }, [lastId, markRead, embedded]);
  const others = thread.members.filter((row) => row.userId !== user.id);
  const title = threadTitle({
    subject: thread.mailbox ? null : thread.subject,
    others: thread.mailbox
      ? others.filter((row) => row.outside || row.role === "member")
      : others,
  });
  const timeZone = user.school.timeZone;
  const lastOwn = thread.messages
    .toReversed()
    .find((entry) => entry.kind === "message" && entry.authorId === user.id);
  const seenBy = (entry: Entry) =>
    thread.showsSeen && entry.id === lastOwn?.id
      ? others.filter(
          (member) =>
            member.lastReadAt !== null && member.lastReadAt >= entry.createdAt,
        ).length
      : null;
  return (
    <section
      aria-label={title}
      className={cn(
        "grid min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto]",
        embedded ? "overflow-hidden rounded-lg border" : "h-full min-h-[28rem]",
      )}
    >
      <header className="flex items-center gap-2 border-b px-3 py-2">
        {onBack ? (
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
        ) : null}
        <div className="grid min-w-0 flex-1">
          <h2 className="truncate text-base leading-6 font-semibold">
            {header ?? title}
          </h2>
          {thread.mailbox && thread.subject ? (
            <span
              dir="auto"
              className="truncate text-[13px] leading-[18px] text-muted-foreground"
            >
              {thread.subject}
            </span>
          ) : null}
          {thread.student && !thread.mailbox ? (
            <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
              {m.msgAbout({ name: nameOf(thread.student) })}
            </span>
          ) : null}
          {thread.owner ? (
            <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
              {m.msgHeldBy({ name: nameOf(thread.owner) })}
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
        className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3 overflow-y-auto p-4"
        aria-label={m.msgMessages()}
      >
        {thread.messages.length === 0 ? (
          <li className="py-6 text-center text-sm leading-5 text-muted-foreground">
            {m.msgNothingYet()}
          </li>
        ) : null}
        {thread.messages.flatMap((entry, index) => {
          const day = dayOf(entry.createdAt, timeZone);
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
          const own = entry.authorId === user.id && !entry.authorContactId;
          const drawn =
            entry.kind === "message" ? (
              <Bubble
                key={entry.id}
                entry={entry}
                own={own}
                showAuthor={!own && (thread.members.length > 2 || thread.team)}
                seen={seenBy(entry)}
                timeZone={timeZone}
              />
            ) : (
              <InternalEntry
                key={entry.id}
                entry={entry as Entry & { kind: Exclude<EntryKind, "message"> }}
                mailbox={thread.mailbox}
                timeZone={timeZone}
              />
            );
          return [...(heading ? [heading] : []), drawn];
        })}
        <li ref={end} aria-hidden className="h-px" />
      </ol>
      {thread.canWrite ? (
        <Composer key={thread.id} thread={thread} fields={fields} />
      ) : (
        <div />
      )}
      {membersOpen ? (
        <MembersSheet thread={thread} onClose={() => setMembersOpen(false)} />
      ) : null}
    </section>
  );
}
