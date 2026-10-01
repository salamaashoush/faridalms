import type { FileSummary } from "@faridalms/domain/file";
import type { ThreadKind } from "@faridalms/domain/messages";

import {
  MESSAGE_ATTACHMENT_BYTES,
  MESSAGE_ATTACHMENT_LIMIT,
} from "@faridalms/domain/file";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ComboboxField } from "~/components/system/ComboboxField";
import { FormField, SelectField, TextField } from "~/components/system/field";
import { FileField } from "~/components/system/FileField";
import { SheetForm } from "~/components/system/SheetForm";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { messageRecipientsQuery } from "~/queries/messages";
import { startThread } from "~/server/messages";
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

/** Starts a conversation, or continues the open one with the same people. */
export function NewMessage({
  canStartFamily,
  onClose,
  onStarted,
}: {
  canStartFamily: boolean;
  onClose: () => void;
  onStarted: (threadId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<ThreadKind>(
    canStartFamily ? "family" : "direct",
  );
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [labels, setLabels] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<FileSummary[]>([]);
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
    mutationFn: () =>
      startThread({
        data: {
          kind,
          recipientIds: kind === "family" ? [] : picked,
          studentId: kind === "family" ? (picked[0] ?? "") : "",
          subject: kind === "group" ? subject.trim() : "",
          body: body.trim(),
          fileIds: files.map((file) => file.id),
        },
      }),
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
    body: body.trim() ? null : m.msgBodyNeeded(),
  };
  return (
    <SheetForm
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={m.msgNew()}
      submitLabel={m.msgSend()}
      pending={start.isPending}
      error={start.error ? getMessageFromError(start.error) : null}
      onSubmit={async () => {
        setShown(true);
        if (Object.values(issues).some(Boolean)) return;
        await start.mutateAsync().then(
          async (result) => {
            await queryClient.invalidateQueries({ queryKey: ["messages"] });
            onStarted(result.threadId);
          },
          () => undefined,
        );
      }}
    >
      {canStartFamily ? (
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
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={5}
            maxLength={5000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        )}
      </FormField>
      <FileField
        id="new-message-files"
        label={m.msgAttachments()}
        optional
        purpose="attachment"
        value={files}
        onChange={(update) => setFiles(update)}
        maxFiles={MESSAGE_ATTACHMENT_LIMIT}
        maxBytes={MESSAGE_ATTACHMENT_BYTES}
      />
    </SheetForm>
  );
}
