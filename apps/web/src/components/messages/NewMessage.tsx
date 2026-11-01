import type { ContentDocument } from "@faridalms/domain/content";
import type { StartKind } from "@faridalms/domain/messages";

import { emptyContent } from "@faridalms/domain/content-conversion";
import { hasWords } from "@faridalms/domain/messages";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { ContentEditor } from "~/components/content/ContentEditor";
import { ComboboxField } from "~/components/system/ComboboxField";
import { FormField, SelectField, TextField } from "~/components/system/field";
import { SheetForm } from "~/components/system/SheetForm";
import { useDocumentMedia } from "~/hooks/useDocumentMedia";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { messageRecipientsQuery } from "~/queries/messages";
import { startThread } from "~/server/messages";
import { formatList, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { nameOf } from "./format";

type Recipient = Awaited<
  ReturnType<NonNullable<ReturnType<typeof messageRecipientsQuery>["queryFn"]>>
>["rows"][number];

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

/**
 * Starts a conversation, or continues the open one with the same people.
 * Opened about students, as from a record or the students picked in a
 * list, it is to their guardians and nobody else is to be picked: each
 * family in a conversation of its own, about its child. A student none of
 * whose guardians uses the portal is named as not reached.
 */
export function NewMessage({
  canStartFamily,
  about,
  onClose,
  onStarted,
}: {
  canStartFamily: boolean;
  about?: readonly { id: string; name: string }[];
  onClose: () => void;
  /** The conversation to open; none where several were written to. */
  onStarted: (threadId: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<StartKind>(
    canStartFamily ? "family" : "direct",
  );
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>(
    about?.[0] ? [about[0].id] : [],
  );
  const several = about !== undefined && about.length > 1;
  const [labels, setLabels] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState<ContentDocument>(emptyContent);
  const [uploading, setUploading] = useState(false);
  const media = useDocumentMedia(undefined);
  const [shown, setShown] = useState(false);
  const found = useQuery(messageRecipientsQuery(search)).data?.rows ?? [];
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
      const started = await startThread({
        data: {
          kind,
          recipientIds: kind === "family" ? [] : picked,
          studentId: kind === "family" ? (picked[0] ?? "") : "",
          subject: kind === "group" ? subject.trim() : "",
          content,
        },
      });
      return { threadId: started.threadId, missed: [] as string[] };
    },
    meta: { inlineError: true },
  });
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
  return (
    <SheetForm
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={m.msgNew()}
      submitLabel={m.msgSend()}
      pending={start.isPending || uploading}
      error={start.error ? getMessageFromError(start.error) : null}
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
        />
      )}
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
  );
}
