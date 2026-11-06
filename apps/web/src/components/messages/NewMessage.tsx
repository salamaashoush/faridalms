import type { ContentDocument } from "@faridalms/domain/content";
import type { StartKind } from "@faridalms/domain/messages";

import { emptyContent } from "@faridalms/domain/content-conversion";
import { hasWords } from "@faridalms/domain/messages";
import { ComboboxField } from "@faridalms/ui/system/combobox-field";
import { ConfirmDialog } from "@faridalms/ui/system/confirm-dialog";
import {
  FormField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { draftQuery } from "~/queries/messages";

import { ContentEditor } from "~/components/content/ContentEditor";
import { useDocumentMedia } from "~/hooks/useDocumentMedia";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { messageRecipientsQuery } from "~/queries/messages";
import { startThread } from "~/server/messages";
import { formatList, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { useMessageDraft } from "./draft";
import { nameOf } from "./format";

type Recipient = Awaited<
  ReturnType<NonNullable<ReturnType<typeof messageRecipientsQuery>["queryFn"]>>
>["rows"][number];

/** A draft of a new conversation as the server keeps it, to write on from. */
export type OpenedDraft = Extract<
  NonNullable<
    Awaited<ReturnType<NonNullable<ReturnType<typeof draftQuery>["queryFn"]>>>
  >,
  { reply: false }
>;

interface Named {
  userId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
}

function recipientLabel(row: Recipient) {
  if (row.kind !== "guardian" || row.children.length === 0) return nameOf(row);
  return m.msgGuardianOf({
    name: nameOf(row),
    children: new Intl.ListFormat(getLocale(), { type: "conjunction" }).format(
      row.children.map(nameOf),
    ),
  });
}

/**
 * Writes to each student's family in turn, in the order given. A student
 * none of whose guardians uses the portal is passed over and named; any
 * other failure stops there.
 */
async function toEachFamily(
  students: readonly { id: string; name: string }[],
  send: (studentId: string) => Promise<{ threadId: string }>,
): Promise<{ threadId: string | null; missed: string[] }> {
  const [student, ...rest] = students;
  if (!student) return { threadId: null, missed: [] };
  let threadId: string | null = null;
  const missed: string[] = [];
  try {
    threadId = (await send(student.id)).threadId;
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "messages.no_guardians")
      throw error;
    missed.push(student.name);
  }
  const after = await toEachFamily(rest, send);
  return {
    threadId: threadId ?? after.threadId,
    missed: [...missed, ...after.missed],
  };
}

const NO_CHILD = "none";
const NOBODY: readonly Named[] = [];

export interface NewMessageProps {
  canStartFamily: boolean;
  about?: readonly { id: string; name: string }[];
  /** Someone to write to directly, as from their profile. */
  to?: { id: string; name: string };
  /** A guardian's children, any of whom a message may be about. */
  childrenToName?: readonly Named[];
  draft?: OpenedDraft;
  onClose: () => void;
  /** The conversation to open; none where several were written to. */
  onStarted: (threadId: string | null) => void;
  /** The draft now kept, or none once it was emptied. */
  onKept?: (draftId: string) => void;
}

/**
 * Starts a conversation, or continues the open one with the same people.
 * Opened about students, as from a record or the students picked in a
 * list, it is to their guardians and nobody else is to be picked: each
 * family in a conversation of its own, about its child. A student none of
 * whose guardians uses the portal is named as not reached. A guardian may
 * say which of their children it is about.
 *
 * What is written is kept as a draft as it is written, so closing the
 * sheet keeps it in Drafts; a message to several families at once cannot
 * be a draft, so closing that one asks before it is thrown away.
 */
export function NewMessage({
  canStartFamily,
  about,
  to,
  childrenToName = NOBODY,
  draft: opened,
  onClose,
  onStarted,
  onKept,
}: NewMessageProps) {
  const queryClient = useQueryClient();
  const hydrated = useHydrated();
  const [kind, setKind] = useState<StartKind>(
    opened?.kind ?? (canStartFamily && !to ? "family" : "direct"),
  );
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>(() =>
    opened
      ? opened.kind === "family"
        ? opened.student
          ? [opened.student.id]
          : []
        : opened.recipients.map((row) => row.userId)
      : about?.[0]
        ? [about[0].id]
        : to
          ? [to.id]
          : [],
  );
  const several = about !== undefined && about.length > 1;
  const [labels, setLabels] = useState<ReadonlyMap<string, string>>(
    () =>
      new Map([
        ...(opened?.recipients ?? []).map(
          (row) => [row.userId, recipientLabel(row)] as const,
        ),
        ...(opened?.kind === "family" && opened.student
          ? [[opened.student.id, nameOf(opened.student)] as const]
          : []),
        ...(to ? [[to.id, to.name] as const] : []),
      ]),
  );
  const [child, setChild] = useState(
    opened?.kind === "direct" && opened.student ? opened.student.id : NO_CHILD,
  );
  const [subject, setSubject] = useState(opened?.subject ?? "");
  const [content, setContent] = useState<ContentDocument>(
    () => opened?.content ?? emptyContent(),
  );
  const [uploading, setUploading] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const media = useDocumentMedia(undefined, "message_attachment");
  const [shown, setShown] = useState(false);
  const recipients = useInfiniteQuery(
    messageRecipientsQuery(search, kind === "family" ? "students" : "people"),
  );
  const found = recipients.data?.pages.flatMap((page) => page.rows) ?? [];
  const eligible = found.filter((row) =>
    kind === "family" ? row.kind === "student" : row.kind !== "student",
  );
  const options = [
    ...picked.map((userId) => ({
      value: userId,
      label: labels.get(userId) ?? "",
    })),
    ...eligible
      .filter((row) => !picked.includes(row.userId))
      .map((row) => ({ value: row.userId, label: recipientLabel(row) })),
  ];
  const aboutChild =
    kind === "direct" && child !== NO_CHILD
      ? child
      : kind === "family"
        ? (picked[0] ?? "")
        : "";
  const lastKept = useRef(opened?.id ?? "");
  const draft = useMessageDraft({
    value: { kind, picked, aboutChild, subject, content },
    initial: opened ? { id: opened.id, version: opened.version } : null,
    toDraft: (value) => ({
      kind: value.kind,
      recipientIds: value.kind === "family" ? [] : value.picked,
      studentId: value.aboutChild,
      subject: value.kind === "group" ? value.subject : "",
      content: value.content,
    }),
    enabled: hydrated && !several && !uploading,
    onKept: (kept) => {
      if (kept.id === lastKept.current) return;
      lastKept.current = kept.id;
      onKept?.(kept.id);
    },
  });
  const { flush } = draft;
  useEffect(() => () => void flush(), [flush]);
  const start = useMutation({
    mutationFn: async () => {
      if (about && several)
        return toEachFamily(about, (studentId) =>
          startThread({
            data: {
              kind: "family",
              recipientIds: [],
              studentId,
              subject: "",
              content,
            },
          }),
        );
      await draft.flush();
      const kept = draft.current();
      const started = await startThread({
        data: {
          kind,
          recipientIds: kind === "family" ? [] : picked,
          studentId: aboutChild,
          subject: kind === "group" ? subject.trim() : "",
          content,
          draftId: kept.id,
          draftVersion: kept.version,
        },
      });
      draft.sent({ kind, picked, aboutChild, subject, content });
      return { threadId: started.threadId, missed: [] as string[] };
    },
    meta: { inlineError: true },
  });
  const close = async () => {
    if (several) {
      if (hasWords(content)) setLeaving(true);
      else onClose();
      return;
    }
    if (!(await draft.flush())) {
      setLeaving(true);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["messages", "drafts"] });
    if (draft.current().id) toast.success(m.msgDraftKept());
    onClose();
  };
  const who =
    picked.length === 0
      ? m.msgPickRecipient()
      : kind === "group" && picked.length < 2
        ? m.msgPickTwo()
        : null;
  const issues = {
    who,
    subject: kind === "group" && !subject.trim() ? m.msgSubjectNeeded() : null,
    body: hasWords(content) ? null : m.msgBodyNeeded(),
  };
  const failure = start.error
    ? getMessageFromError(start.error)
    : (draft.error ?? null);
  return (
    <>
      <SheetForm
        open
        onOpenChange={(open) => {
          if (!open) void close();
        }}
        title={m.msgNew()}
        submitLabel={m.msgSend()}
        pending={start.isPending || uploading}
        error={failure}
        status={several ? null : draft.status}
        onSubmit={async () => {
          setShown(true);
          if (Object.values(issues).some(Boolean)) return;
          await start.mutateAsync().then(
            async (result) => {
              await queryClient.invalidateQueries({ queryKey: ["messages"] });
              if (!about || !several) return onStarted(result.threadId);
              if (result.missed.length > 0)
                toast.warning(
                  m.msgNoGuardiansFor({ names: formatList(result.missed) }),
                );
              const reached = about.length - result.missed.length;
              if (reached > 0)
                toast.success(
                  m.msgSentToFamilies({ count: formatNumber(reached) }),
                );
              // Several conversations were written to; none is the one to open.
              return onStarted(null);
            },
            () => undefined,
          );
        }}
      >
        {about ? (
          <p className="grid gap-1 text-sm leading-5">
            <span className="font-medium">
              {several
                ? m.msgToGuardiansOfMany({ count: formatNumber(about.length) })
                : m.msgToGuardiansOf({ name: about[0]?.name ?? "" })}
            </span>
            <span className="text-[13px] leading-[18px] text-muted-foreground">
              {several ? m.msgToGuardiansEach() : m.msgFamilyHint()}
            </span>
          </p>
        ) : null}
        {canStartFamily && !about ? (
          <SelectField
            id="new-message-kind"
            label={m.msgTo()}
            value={kind}
            options={[
              { value: "family", label: m.msgKindFamily() },
              { value: "direct", label: m.msgKindPerson() },
              { value: "group", label: m.msgKindGroup() },
            ]}
            onChange={(next) => {
              setKind(next);
              setPicked([]);
            }}
            width="name"
          />
        ) : null}
        {about ? null : (
          <ComboboxField
            label={
              kind === "family"
                ? m.msgFamilyOfStudent()
                : kind === "group"
                  ? m.msgPeople()
                  : m.msgPerson()
            }
            hint={kind === "family" ? m.msgFamilyHint() : undefined}
            multiple={kind === "group"}
            options={options}
            value={picked}
            onChange={(next) => {
              setLabels(
                (current) =>
                  new Map([
                    ...current,
                    ...options.map(
                      (option) => [option.value, option.label] as const,
                    ),
                  ]),
              );
              setPicked(kind === "group" ? next : next.slice(-1));
            }}
            search={search}
            onSearchChange={setSearch}
            errors={shown && issues.who ? [issues.who] : undefined}
            more={
              recipients.hasNextPage
                ? {
                    label: m.msgMoreRecipients(),
                    pending: recipients.isFetchingNextPage,
                    onMore: () => void recipients.fetchNextPage(),
                  }
                : undefined
            }
          />
        )}
        {kind === "direct" && childrenToName.length > 0 ? (
          <SelectField
            id="new-message-about"
            label={m.msgAboutChild()}
            optional
            hint={m.msgAboutChildHint()}
            value={child}
            options={[
              { value: NO_CHILD, label: m.msgAboutNone() },
              ...childrenToName.map((row) => ({
                value: row.userId,
                label: nameOf(row),
              })),
            ]}
            onChange={setChild}
            width="name"
          />
        ) : null}
        {kind === "group" ? (
          <TextField
            id="new-message-subject"
            label={m.msgSubject()}
            dir="auto"
            maxLength={200}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            errors={shown && issues.subject ? [issues.subject] : undefined}
          />
        ) : null}
        <FormField
          id="new-message-body"
          label={m.msgMessage()}
          errors={shown && issues.body ? [issues.body] : undefined}
        >
          {() => (
            <ContentEditor
              id="new-message-body"
              label={m.msgMessage()}
              value={content}
              onChange={setContent}
              onUploadingChange={setUploading}
              media={media}
            />
          )}
        </FormField>
      </SheetForm>
      <ConfirmDialog
        open={leaving}
        title={several ? m.msgDiscardTitle() : m.editorLeaveTitle()}
        body={several ? m.msgDiscardBody() : m.editorLeaveHint()}
        confirmLabel={m.editorDiscard()}
        cancelLabel={m.editorKeepEditing()}
        onConfirm={() => {
          void draft.settle();
          setLeaving(false);
          onClose();
        }}
        onCancel={() => setLeaving(false)}
      />
    </>
  );
}
