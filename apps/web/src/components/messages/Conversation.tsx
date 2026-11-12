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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@faridalms/ui/select";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { Segmented } from "@faridalms/ui/system/panel";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import {
  ArrowLeft,
  Mail,
  MailCheck,
  SendHorizontal,
  Users,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { ContentEditor } from "~/components/content/ContentEditor";
import { ContentView } from "~/components/content/ContentView";
import { TemplatePicker } from "~/components/content/Templates";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { useDocumentMedia } from "~/hooks/useDocumentMedia";
import * as m from "~/i18n/messages";
import { earlierEntriesQuery, threadQuery } from "~/queries/messages";
import { acceptHeldMail, markThreadRead, sendMessage } from "~/server/messages";
import { formatInstant, formatList, schoolDayOf } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";
import { useWords } from "~/utils/words";

import { useMessageDraft } from "./draft";
import { ENTRY_ICON, entryTitle, NameLink, useMailboxWords } from "./entries";
import { dayHeading, nameOf, threadTitle } from "./format";
import { MembersSheet } from "./MembersSheet";
import { useReplying } from "./presence";

type Thread = Awaited<
  ReturnType<NonNullable<ReturnType<typeof threadQuery>["queryFn"]>>
>;
type Entry = Thread["messages"][number];

const fileUrl = (fileId: string) => `/files/${fileId}`;

const documentOf = (entry: Entry) =>
  entry.content ?? (entry.body ? plainContent(entry.body) : null);

/**
 * Whether an entry is paragraphs of words alone, whose bubble can take the
 * width of its text. A list, a table, a file or a picture measures itself
 * against its container and has no width of its own, so its bubble takes
 * the room it is given rather than collapsing to nothing.
 */
const wordsOnly = (entry: Entry) =>
  (documentOf(entry)?.root.children ?? []).every(
    (node) => node.type === "paragraph",
  );

interface WordsProps {
  entry: Entry;
  fit?: boolean;
}

/** What an entry says: its document, or for one written before documents, its text. */
function Words({ entry, fit = false }: WordsProps) {
  if (entry.redacted)
    return (
      <p className="text-sm leading-5 text-muted-foreground italic">
        {m.msgRemoved()}
      </p>
    );
  const document = documentOf(entry);
  if (!document) return null;
  const view = <ContentView document={document} fileUrl={fileUrl} />;
  // A bubble of words takes the width of its text, measured by the text
  // laid out unseen beside it.
  if (!fit || !wordsOnly(entry))
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

interface BubbleProps {
  entry: Entry;
  own: boolean;
  showAuthor: boolean;
  seen: number | null;
}

function Bubble({ entry, own, showAuthor, seen }: BubbleProps) {
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
            <NameLink userId={entry.authorId} link={entry.authorLink}>
              {nameOf({
                fullNameEn: entry.authorNameEn,
                fullNameAr: entry.authorNameAr,
              })}
            </NameLink>
          </span>
        ) : null}
        <div
          className={cn(
            "max-w-full rounded-2xl px-3.5 py-2",
            !entry.redacted && !wordsOnly(entry) && "w-full",
            own
              ? "rounded-ee-md bg-primary text-primary-foreground"
              : "rounded-es-md bg-muted",
          )}
        >
          {own ? (
            // The document reads the app's tokens, so on the bubble's colour
            // its text, accent and muted words take the bubble's ink.
            <div className="[--foreground:var(--primary-foreground)] [--muted-foreground:color-mix(in_oklab,var(--primary-foreground)_72%,transparent)] [--primary:var(--primary-foreground)]">
              <Words entry={entry} fit />
            </div>
          ) : (
            <Words entry={entry} fit />
          )}
        </div>
        <span className="flex items-center gap-1 px-1 text-[12px] leading-4 text-muted-foreground">
          {entry.authorContactId ? (
            <>
              <Mail aria-hidden className="size-3" />
              <span>{m.msgByEmail()}</span>
              <span aria-hidden>·</span>
            </>
          ) : null}
          {formatInstant(entry.createdAt, "time")}
          {seen !== null && seen > 0
            ? ` · ${m.msgSeenBy({ count: seen })}`
            : null}
        </span>
      </div>
    </li>
  );
}

type Member = Thread["members"][number];

interface AcceptHeldProps {
  threadId: string;
  entryId: string;
  contacts: Member[];
}

/**
 * Lets held mail in as the family's message, for the team that writes in
 * the conversation. With several outside contacts in it, the team says
 * whose it is.
 */
function AcceptHeld({ threadId, entryId, contacts }: AcceptHeldProps) {
  const queryClient = useQueryClient();
  const accept = useMutation({
    mutationFn: (contactId: string) =>
      acceptHeldMail({ data: { threadId, entryId, contactId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["messages"] }),
    meta: { inlineError: true },
  });
  const choices: { contactId: string; label: string }[] =
    contacts.length > 1
      ? contacts.map((member) => ({
          contactId: member.contactId ?? "",
          label: m.msgAcceptHeldAs({ name: nameOf(member) }),
        }))
      : [{ contactId: "", label: m.msgAcceptHeld() }];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {choices.map((choice) => (
        <Button
          key={choice.contactId || "only"}
          type="button"
          variant="outline"
          size="sm"
          className="max-md:h-10"
          disabled={accept.isPending}
          onClick={() => accept.mutate(choice.contactId)}
        >
          <MailCheck aria-hidden />
          {choice.label}
        </Button>
      ))}
      {accept.error ? (
        <p role="alert" className="text-[13px] leading-[18px] text-destructive">
          {getMessageFromError(accept.error)}
        </p>
      ) : null}
    </div>
  );
}

interface InternalEntryProps {
  entry: Entry & { kind: Exclude<EntryKind, "message"> };
  mailbox: Thread["mailbox"];
  threadId: string;
  /** The outside contacts held mail may be let in as, for a team that writes here. */
  contacts: Member[] | null;
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
  threadId,
  contacts,
}: InternalEntryProps) {
  const words = useWords();
  const owner = useMailboxWords(mailbox);
  const Icon = ENTRY_ICON[entry.kind];
  const title = entryTitle(owner, entry.kind, entry.details, words);
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
              <NameLink userId={entry.authorId} link={entry.authorLink}>
                {author}
              </NameLink>
            </>
          ) : null}
          {" · "}
          {formatInstant(entry.createdAt, "time")}
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
              <NameLink userId={entry.authorId} link={entry.authorLink}>
                {author}
              </NameLink>
              {" · "}
            </>
          ) : null}
          {formatInstant(entry.createdAt, "time")}
        </span>
      </p>
      <Words entry={entry} />
      {entry.kind === "held" && typeof entry.details.acceptedAs === "string" ? (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.msgHeldAccepted()}
        </p>
      ) : entry.kind === "held" &&
        !entry.redacted &&
        contacts &&
        contacts.length > 0 ? (
        <AcceptHeld
          threadId={threadId}
          entryId={entry.id}
          contacts={contacts}
        />
      ) : null}
    </li>
  );
}

type Mode = "message" | "note" | "logged";

interface ComposerProps {
  thread: Thread;
  fields?: { child?: string };
}

/**
 * Writes into the conversation. A team writes a message to everyone, a
 * note for each other, or a call, meeting or email that happened outside
 * the app; anyone else writes a message. A message someone overtook is
 * held back until the writer has read what came in, or sends it anyway.
 */
function Composer({ thread, fields }: ComposerProps) {
  const words = useWords();
  const owner = useMailboxWords(thread.mailbox);
  const hydrated = useHydrated();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const id = useId();
  const media = useDocumentMedia(undefined, "message_attachment");
  const [content, setContent] = useState<ContentDocument>(
    () => thread.draft?.content ?? emptyContent(),
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
  const draft = useMessageDraft({
    value: content,
    initial: thread.draft,
    toDraft: (value) => ({ threadId: thread.id, content: value }),
    enabled: hydrated && !uploading,
  });
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
  const { flush } = draft;
  useEffect(() => () => void flush(), [flush]);
  const replying = useReplying(
    thread.id,
    hydrated && user.workspace === "staff",
  );
  const clear = () => {
    replying.wrote(false);
    const empty = emptyContent();
    draft.sent(empty);
    setContent(empty);
    setReplace({ to: empty, at: Date.now() });
  };
  const submit = (force = false) => {
    if (!hasWords(content) || send.isPending || uploading) return;
    setOvertaken(false);
    void draft
      .flush()
      .then(() => send.mutateAsync(force))
      .then(
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
  // A contact with no account is reached only by email, so the team hears
  // where that no longer works before it writes.
  const unreachable = thread.members.filter(
    (member) => member.outside && !member.userId && member.unreachable,
  );
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
  const blocked =
    !hydrated || !hasWords(content) || uploading || send.isPending;
  const sendLabel = mode === "message" ? m.msgSend() : m.msgSave();
  const actions = useMemo(
    () => (
      <div className="flex shrink-0 items-center gap-3">
        {draft.status ? (
          <span
            aria-live="polite"
            className="text-[13px] leading-[18px] text-muted-foreground max-sm:sr-only"
          >
            {draft.status}
          </span>
        ) : null}
        <Button type="submit" className="max-md:h-10" disabled={blocked}>
          <SendHorizontal className="rtl:rotate-180" aria-hidden />
          {sendLabel}
        </Button>
      </div>
    ),
    [draft.status, blocked, sendLabel],
  );
  return (
    <form
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 border-t bg-card px-3 py-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {thread.canNote ? (
        <div className="flex flex-wrap items-center gap-2">
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
            <Select
              value={logged}
              onValueChange={(value) => {
                if (value) setLogged(value);
              }}
            >
              <SelectTrigger
                id={`${id}-logged`}
                aria-label={m.msgLoggedKind()}
                className="h-10"
              >
                <SelectValue>
                  {entryTitle(owner, logged, {}, words)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LOGGED_CONTACTS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {entryTitle(owner, value, {}, words)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          {words(m.msgGoesByEmailCore)()}
        </p>
      ) : null}
      {mode === "message"
        ? unreachable.map((member) => (
            <p
              key={member.contactId}
              className="text-[13px] leading-[18px] text-warning-foreground dark:text-warning"
            >
              {(member.unreachable === "complained"
                ? m.msgUnreachableComplained
                : m.msgUnreachableBounced)({
                name: nameOf(member),
                email: member.email ?? "",
              })}
            </p>
          ))
        : null}
      {mode !== "message" ? (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.msgInternalHint()}
        </p>
      ) : null}
      {replying.others.length > 0 ? (
        <p
          aria-live="polite"
          className="text-[13px] leading-[18px] text-muted-foreground italic"
        >
          {replying.others.length === 1
            ? m.msgReplyingOne({ name: replying.others[0] ?? "" })
            : m.msgReplyingMany({ names: formatList(replying.others) })}
        </p>
      ) : null}
      <ContentEditor
        id={`${id}-body`}
        variant="message"
        actions={actions}
        label={label}
        placeholder={mode === "message" ? m.msgWritePlaceholder() : label}
        value={content}
        onChange={(value) => {
          setContent(value);
          replying.wrote(hasWords(value));
        }}
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
      ) : draft.error ? (
        <p role="alert" className="text-[13px] leading-[18px] text-destructive">
          {draft.error}
        </p>
      ) : null}
    </form>
  );
}

export interface ConversationProps {
  threadId: string;
  onBack?: () => void;
  /** Drawn within a record's page rather than as Messages' second pane. */
  embedded?: boolean;
  /** What a template's fields are filled with beyond the conversation's own. */
  fields?: { child?: string };
  header?: ReactNode;
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
}: ConversationProps) {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const thread = useSuspenseQuery(threadQuery(threadId)).data;
  const [membersOpen, setMembersOpen] = useState(false);
  const end = useRef<HTMLLIElement>(null);
  const { mutate: markRead } = useMutation({
    mutationFn: () => markThreadRead({ data: { threadId } }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["messages", "inbox"] }),
        queryClient.invalidateQueries({ queryKey: ["messages", "unread"] }),
      ]),
  });
  const lastId = thread.messages.at(-1)?.id;
  useEffect(() => {
    if (!lastId) return;
    markRead();
    if (!embedded) end.current?.scrollIntoView({ block: "end" });
  }, [lastId, markRead, embedded]);
  const oldest = thread.messages[0]?.id ?? "";
  const [reading, setReading] = useState(false);
  const earlier = useInfiniteQuery({
    ...earlierEntriesQuery(threadId, oldest),
    enabled: reading && thread.next !== null && oldest !== "",
  });
  const entries = [
    ...(earlier.data?.pages.toReversed().flatMap((page) => page.messages) ??
      []),
    ...thread.messages,
  ];
  const further = reading ? earlier.hasNextPage : thread.next !== null;
  const others = thread.members.filter((row) => row.userId !== user.id);
  const title = threadTitle({
    subject: thread.mailbox ? null : thread.subject,
    others: thread.mailbox
      ? others.filter((row) => row.outside || row.role === "member")
      : others,
  });
  const outsideContacts = thread.members.filter(
    (member) => member.contactId !== null && member.role === "member",
  );
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
        {entries.length === 0 ? (
          <li>
            <EmptyState placement="section" title={m.msgNothingYet()} />
          </li>
        ) : null}
        {further ? (
          <li className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="max-md:h-10"
              disabled={earlier.isFetching}
              onClick={() => {
                if (!reading) setReading(true);
                else void earlier.fetchNextPage();
              }}
            >
              {m.msgEarlier()}
            </Button>
          </li>
        ) : null}
        {entries.flatMap((entry, index) => {
          const day = schoolDayOf(entry.createdAt);
          const before = entries[index - 1];
          const heading =
            before && schoolDayOf(before.createdAt) === day ? null : (
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
              />
            ) : (
              <InternalEntry
                key={entry.id}
                entry={entry as Entry & { kind: Exclude<EntryKind, "message"> }}
                mailbox={thread.mailbox}
                threadId={thread.id}
                contacts={thread.canNote ? outsideContacts : null}
              />
            );
          return heading ? [heading, drawn] : [drawn];
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
