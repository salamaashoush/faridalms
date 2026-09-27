import type { ContentDocument } from "@faridalms/domain/content";
import type { FileSummary } from "@faridalms/domain/file";
import type { Role } from "@faridalms/domain/identity";
import type { ComposeMessageInput } from "@faridalms/domain/school-schema";

import { contentPlainText } from "@faridalms/domain/content";
import { emptyContent } from "@faridalms/domain/content-conversion";
import {
  MESSAGE_ATTACHMENT_BYTES,
  MESSAGE_ATTACHMENT_LIMIT,
} from "@faridalms/domain/file";
import {
  MESSAGE_CATEGORIES,
  composeMessageSchema,
} from "@faridalms/domain/school-schema";
import { useForm } from "@tanstack/react-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Send, ArrowLeft } from "lucide-react";
import { Suspense, useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/app/field";
import { PageHeader } from "~/components/app/primitives";
import { UnsavedChangesGuard } from "~/components/app/UnsavedChangesGuard";
import { FileUploader } from "~/components/assignments/FileUploader";
import { ContentEditor } from "~/components/content/ContentEditor";
import { MarkdownComposer } from "~/components/records/MarkdownComposer";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { Textarea } from "~/components/ui/textarea";
import { LEGACY_ROLE } from "~/data/legacy-role";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { recipientQuery } from "~/queries/people";
import { visibleStudentsQuery } from "~/queries/school";
import {
  getMessageDraft,
  saveMessageDraft,
  sendMessageDraft,
} from "~/server/message-drafts";
import { getMessageFromError } from "~/utils/error";

import { DraftConflictReview } from "./DraftConflictReview";
import { RecipientPicker } from "./RecipientPicker";

type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];

const CATEGORY_LABEL: Record<MessageCategory, () => string> = {
  teachers: m.messagesRecipientTeachers,
  administration: m.messagesRecipientAdministration,
  parents: m.messagesRecipientParents,
  students: m.messagesRecipientStudents,
};

type SavedDraft = Awaited<ReturnType<typeof getMessageDraft>>;

/** Who a new message goes to and which student it is about, from a link. */
export interface ComposeSeed {
  to: string;
  about: string;
}

interface Preset {
  category: MessageCategory;
  recipientId: string;
  recipientLabel: string;
  studentId: string;
}

const ROLE_CATEGORY: Record<Role, MessageCategory> = {
  admin: "administration",
  teacher: "teachers",
  parent: "parents",
  student: "students",
};

function categoriesFor(role: Role): MessageCategory[] {
  return MESSAGE_CATEGORIES.filter(
    (category) =>
      role === "admin" ||
      role === "teacher" ||
      category === "teachers" ||
      category === "administration",
  );
}

function recipientName(person: { name: string; title?: string | null }) {
  return person.title ? `${person.name} (${person.title})` : person.name;
}

type ComposeValues = Pick<
  ComposeMessageInput,
  "category" | "recipientId" | "studentId" | "subject" | "body" | "bodyFormat"
>;

function ComposeForm({
  initial,
  preset,
  onSaved,
  onSent,
  onClose,
}: {
  initial?: SavedDraft;
  preset?: Preset;
  onSaved: (id: string) => void;
  onSent: (id: string) => void;
  onClose: () => void;
}) {
  const hydrated = useHydrated();
  const sent = useRef(false);
  const [failure, setFailure] = useState<string>();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const students = useSuspenseQuery(visibleStudentsQuery).data;

  const draftId = useRef(initial?.id);
  const revision = useRef(initial?.revision ?? 0);
  const save = useServerFn(saveMessageDraft);
  const send = useServerFn(sendMessageDraft);
  const readDraft = useServerFn(getMessageDraft);
  const [latest, setLatest] = useState<SavedDraft>();
  const [reviewPending, setReviewPending] = useState(false);
  const [selectionSource, setSelectionSource] = useState(initial);
  const [recipientLabel, setRecipientLabel] = useState(
    initial?.recipient?.name ?? preset?.recipientLabel ?? "",
  );
  const [recipientVersion, setRecipientVersion] = useState(0);
  const [editorVersion, setEditorVersion] = useState(0);
  const draftMutation = useMutation({ mutationFn: save });
  const [defaultValues, setDefaultValues] = useState<ComposeValues>({
    category: initial?.category ?? preset?.category ?? "teachers",
    recipientId: initial?.recipientId ?? preset?.recipientId ?? "",
    studentId: initial?.studentId ?? preset?.studentId ?? "",
    subject: initial?.subject ?? "",
    body: initial?.body ?? "",
    bodyFormat: initial?.bodyFormat ?? "rich",
  });
  const [document, setDocument] = useState<ContentDocument>(
    () => initial?.document ?? emptyContent(),
  );
  const [documentValid, setDocumentValid] = useState(true);
  const [files, setFiles] = useState<FileSummary[]>(initial?.files ?? []);
  const [attachmentBaseline, setAttachmentBaseline] = useState(() =>
    JSON.stringify({
      document: initial?.document ?? emptyContent(),
      files: (initial?.files ?? []).map((file) => file.id),
    }),
  );
  const onDocumentValidity = useCallback(
    (valid: boolean) => setDocumentValid(valid),
    [],
  );
  const toInput = (value: ComposeValues): ComposeMessageInput => ({
    ...value,
    document: value.bodyFormat === "rich" ? document : null,
    fileIds: files.map((file) => file.id),
  });
  const persist = async (value: ComposeValues) => {
    if (value.bodyFormat === "rich" && !documentValid)
      throw new Error("content.invalid");
    draftId.current ??= crypto.randomUUID();
    const saved = await draftMutation.mutateAsync({
      data: {
        ...toInput(value),
        id: draftId.current,
        expectedRevision: revision.current,
      },
    });
    revision.current = saved.revision;
    form.reset(value);
    setDefaultValues(value);
    setAttachmentBaseline(
      JSON.stringify({ document, files: files.map((file) => file.id) }),
    );
    await queryClient.invalidateQueries({ queryKey: ["message-drafts"] });
    return saved;
  };

  const form = useForm({
    defaultValues,
    validators: {
      onSubmit: ({ value }) => {
        const result = v.safeParse(composeMessageSchema, toInput(value));
        if (result.success) return undefined;
        const fields: Record<string, v.BaseIssue<unknown>> = {};
        for (const issue of result.issues) {
          const key = issue.path?.[0]?.key;
          if (typeof key === "string") fields[key] = issue;
        }
        return { fields };
      },
    },
    onSubmit: async ({ value }) => {
      setFailure(undefined);
      try {
        const saved =
          isDraftDirty() || !draftId.current || revision.current === 0
            ? await persist(value)
            : { id: draftId.current, revision: revision.current };
        const result = await send({
          data: { id: saved.id, expectedRevision: saved.revision },
        });
        toast.success(m.messagesSentToast());
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["messages"] }),
          queryClient.invalidateQueries({ queryKey: ["message-drafts"] }),
        ]);
        sent.current = true;
        form.reset();
        onSent(result.id);
      } catch (error) {
        setFailure(getMessageFromError(error));
      }
    },
  });

  // The body field mirrors the editor's plain text so its validation state
  // follows what the writer types; the server derives the stored body itself.
  const onDocument = (value: ContentDocument) => {
    setDocument(value);
    form.setFieldValue("body", contentPlainText(value));
  };

  const isDraftDirty = () =>
    (
      [
        "category",
        "recipientId",
        "studentId",
        "subject",
        "body",
        "bodyFormat",
      ] as const
    ).some((key) => form.state.values[key] !== defaultValues[key]) ||
    (form.state.values.bodyFormat === "rich" &&
      (!documentValid ||
        JSON.stringify({ document, files: files.map((file) => file.id) }) !==
          attachmentBaseline));

  const categoryItems = categoriesFor(LEGACY_ROLE[user.workspace]).map(
    (value) => ({
      value,
      label: CATEGORY_LABEL[value](),
    }),
  );

  const studentItems = [
    { value: "", label: m.commComposeAboutNone() },
    ...students.map((student) => ({
      value: student.id,
      label: student.fullName,
    })),
  ];

  if (latest)
    return (
      <>
        <UnsavedChangesGuard
          pending={draftMutation.isPending || reviewPending}
          isDirty={() => !sent.current && isDraftDirty()}
        />
        <DraftConflictReview
          local={toInput(form.state.values)}
          latest={latest}
          localRecipient={recipientLabel}
          localStudent={
            students.find(
              (student) => student.id === form.state.values.studentId,
            )?.fullName ?? ""
          }
          latestStudent={
            students.find((student) => student.id === latest.studentId)
              ?.fullName ?? ""
          }
          pending={draftMutation.isPending || reviewPending}
          localCategory={CATEGORY_LABEL[form.state.values.category]()}
          latestCategory={CATEGORY_LABEL[latest.category]()}
          onRefresh={async () => {
            if (!draftId.current) return;
            setReviewPending(true);
            try {
              setLatest(await readDraft({ data: { id: draftId.current } }));
              setFailure(undefined);
            } catch (error) {
              setFailure(getMessageFromError(error));
            } finally {
              setReviewPending(false);
            }
          }}
          failure={failure}
          onCancel={() => {
            setLatest(undefined);
            setFailure(undefined);
          }}
          onUseSaved={() => {
            if (latest.sentMessageId) {
              sent.current = true;
              onSent(latest.sentMessageId);
              return;
            }
            const values: ComposeValues = {
              category: latest.category,
              recipientId: latest.recipientId ?? "",
              studentId: latest.studentId ?? "",
              subject: latest.subject,
              body: latest.body,
              bodyFormat: latest.bodyFormat,
            };
            revision.current = latest.revision;
            form.reset(values);
            setDefaultValues(values);
            setDocument(latest.document ?? emptyContent());
            setFiles(latest.files);
            setAttachmentBaseline(
              JSON.stringify({
                document: latest.document ?? emptyContent(),
                files: latest.files.map((file) => file.id),
              }),
            );
            setEditorVersion((previous) => previous + 1);
            setSelectionSource(latest);
            setRecipientLabel(latest.recipient?.name ?? "");
            setRecipientVersion((previous) => previous + 1);
            setFailure(undefined);
            setLatest(undefined);
          }}
          onSaveLocal={async () => {
            setFailure(undefined);
            if (latest.sentMessageId) {
              if (draftId.current === latest.id) {
                draftId.current = undefined;
                revision.current = 0;
              }
            } else revision.current = latest.revision;
            try {
              const saved = await persist(form.state.values);
              setLatest(undefined);
              toast.success(m.messageDraftSaved());
              onSaved(saved.id);
            } catch (error) {
              setFailure(getMessageFromError(error));
            }
          }}
        />
      </>
    );

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const element = event.currentTarget;
        void form.handleSubmit().then(() => {
          requestAnimationFrame(() =>
            element
              .querySelector<HTMLElement>('[aria-invalid="true"]')
              ?.focus(),
          );
        });
      }}
      className="flex flex-col gap-6"
    >
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(pending) => (
          <UnsavedChangesGuard
            pending={pending || draftMutation.isPending}
            isDirty={() => !sent.current && isDraftDirty()}
          />
        )}
      </form.Subscribe>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(pending) => (
          <fieldset disabled={!hydrated || pending || draftMutation.isPending}>
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <FieldGroup className="rounded-xl border bg-card p-5 lg:order-2">
                <div>
                  <h2 className="font-semibold">{m.messageDeliveryTitle()}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {m.messageDeliveryHint()}
                  </p>
                </div>
                <form.Field name="category">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor="compose-category">
                        {m.commComposeCategory()}
                      </FieldLabel>
                      <Select
                        items={categoryItems}
                        value={field.state.value}
                        onValueChange={(next) => {
                          if (!next) {
                            return;
                          }
                          field.handleChange(next);
                          // The old recipient belongs to the old group, so keeping it
                          // would send to somebody the reader can no longer see.
                          form.setFieldValue("recipientId", "");
                        }}
                      >
                        <SelectTrigger
                          id="compose-category"
                          className="h-11 w-full sm:h-10"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {categoryItems.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                </form.Field>

                <form.Subscribe selector={(state) => state.values.category}>
                  {(category) => (
                    <form.Field name="recipientId">
                      {(field) => {
                        const invalid =
                          field.state.meta.isTouched &&
                          !field.state.meta.isValid;
                        return (
                          <Field data-invalid={invalid}>
                            <FieldLabel htmlFor="compose-recipient">
                              {m.messagesRecipient()}
                            </FieldLabel>
                            <Suspense
                              fallback={<Skeleton className="h-9 w-full" />}
                            >
                              <RecipientPicker
                                key={`${category}:${recipientVersion}`}
                                initialLabel={
                                  selectionSource?.category === category &&
                                  selectionSource.recipient
                                    ? recipientName(selectionSource.recipient)
                                    : preset?.category === category
                                      ? preset.recipientLabel
                                      : undefined
                                }
                                category={category}
                                value={field.state.value}
                                invalid={invalid}
                                onChange={field.handleChange}
                                onSelection={setRecipientLabel}
                                onBlur={field.handleBlur}
                              />
                            </Suspense>
                            {invalid && (
                              <FieldError
                                id="compose-recipient-error"
                                errors={field.state.meta.errors}
                              />
                            )}
                          </Field>
                        );
                      }}
                    </form.Field>
                  )}
                </form.Subscribe>

                {students.length > 0 ? (
                  <form.Field name="studentId">
                    {(field) => (
                      <Field>
                        <FieldLabel htmlFor="compose-student">
                          {m.messagesAbout()}
                        </FieldLabel>
                        <Select
                          items={studentItems}
                          value={field.state.value ?? ""}
                          onValueChange={(next) =>
                            field.handleChange(next ?? "")
                          }
                        >
                          <SelectTrigger
                            id="compose-student"
                            className="h-11 w-full sm:h-10"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {studentItems.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    )}
                  </form.Field>
                ) : null}
              </FieldGroup>
              <FieldGroup className="min-w-0 rounded-xl border bg-card p-5 sm:p-6 lg:order-1">
                <form.Field name="subject">
                  {(field) => {
                    const invalid =
                      field.state.meta.isTouched && !field.state.meta.isValid;
                    return (
                      <Field data-invalid={invalid}>
                        <FieldLabel htmlFor="compose-subject">
                          {m.messagesSubject()}
                        </FieldLabel>
                        <Input
                          id="compose-subject"
                          aria-describedby={
                            invalid ? "compose-subject-error" : undefined
                          }
                          name={field.name}
                          value={field.state.value}
                          aria-invalid={invalid}
                          onBlur={field.handleBlur}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                        />
                        {invalid && (
                          <FieldError
                            id="compose-subject-error"
                            errors={field.state.meta.errors}
                          />
                        )}
                      </Field>
                    );
                  }}
                </form.Field>

                <form.Field name="body">
                  {(field) => {
                    const invalid =
                      field.state.meta.isTouched && !field.state.meta.isValid;
                    return (
                      <Field data-invalid={invalid}>
                        <FieldLabel htmlFor="compose-body">
                          {m.messagesBody()}
                        </FieldLabel>
                        {defaultValues.bodyFormat === "rich" ? (
                          <>
                            <ContentEditor
                              key={editorVersion}
                              id="compose-body"
                              label={m.messagesBody()}
                              value={document}
                              onChange={onDocument}
                              onValidityChange={onDocumentValidity}
                              disabled={pending || draftMutation.isPending}
                            />
                            <FileUploader
                              label={m.messagesAttachFiles()}
                              purpose="attachment"
                              value={files}
                              onChange={setFiles}
                              maxFiles={MESSAGE_ATTACHMENT_LIMIT}
                              maxBytes={MESSAGE_ATTACHMENT_BYTES}
                              disabled={pending || draftMutation.isPending}
                            />
                          </>
                        ) : defaultValues.bodyFormat === "plain" ? (
                          <Textarea
                            id="compose-body"
                            name={field.name}
                            rows={8}
                            maxLength={20000}
                            value={field.state.value}
                            aria-invalid={invalid}
                            aria-describedby={
                              invalid ? "compose-body-error" : undefined
                            }
                            onBlur={field.handleBlur}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                          />
                        ) : (
                          <MarkdownComposer
                            id="compose-body"
                            describedBy={
                              invalid ? "compose-body-error" : undefined
                            }
                            name={field.name}
                            value={field.state.value}
                            invalid={invalid}
                            onBlur={field.handleBlur}
                            onChange={field.handleChange}
                          />
                        )}
                        {invalid && (
                          <FieldError
                            id="compose-body-error"
                            errors={field.state.meta.errors}
                          />
                        )}
                      </Field>
                    );
                  }}
                </form.Field>
              </FieldGroup>
            </div>
          </fieldset>
        )}
      </form.Subscribe>
      {failure ? (
        <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p role="alert" className="text-sm text-destructive">
            {failure}
          </p>
          {failure === m.messageDraftConflict() ? (
            <Button
              type="button"
              variant="outline"
              disabled={reviewPending}
              onClick={async () => {
                if (!draftId.current) return;
                setReviewPending(true);
                try {
                  setLatest(await readDraft({ data: { id: draftId.current } }));
                  setFailure(undefined);
                } catch (error) {
                  setFailure(getMessageFromError(error));
                } finally {
                  setReviewPending(false);
                }
              }}
            >
              {m.messageReviewVersions()}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-xl border bg-background/95 p-4 backdrop-blur-sm">
        <Button type="button" variant="outline" onClick={onClose}>
          <ArrowLeft className="rtl:rotate-180" aria-hidden />
          {m.commMessagesBack()}
        </Button>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!hydrated || isSubmitting || draftMutation.isPending}
                onClick={async () => {
                  setFailure(undefined);
                  try {
                    const saved = await persist(form.state.values);
                    toast.success(m.messageDraftSaved());
                    onSaved(saved.id);
                  } catch (error) {
                    setFailure(getMessageFromError(error));
                  }
                }}
              >
                {draftMutation.isPending
                  ? m.teachSaving()
                  : m.messageSaveDraft()}
              </Button>
              <Button
                type="submit"
                disabled={!hydrated || isSubmitting || draftMutation.isPending}
              >
                <Send aria-hidden />
                {isSubmitting ? m.commonSending() : m.commonSend()}
              </Button>
            </div>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}

/**
 * A new message addressed from a link. The recipient's own profile names them
 * and says which group they belong to. Someone this writer can no longer
 * reach or cannot address, or a student outside what they can see, is left
 * for them to choose instead.
 */
function SeededComposeForm({
  seed,
  ...props
}: {
  seed: ComposeSeed;
  onSaved: (id: string) => void;
  onSent: (id: string) => void;
  onClose: () => void;
}) {
  const user = useCurrentUser();
  const students = useSuspenseQuery(visibleStudentsQuery).data;
  const profile = useSuspenseQuery(recipientQuery(seed.to)).data;
  const category = profile ? ROLE_CATEGORY[profile.role] : null;
  const preset =
    profile &&
    category &&
    categoriesFor(LEGACY_ROLE[user.workspace]).includes(category)
      ? {
          category,
          recipientId: profile.id,
          recipientLabel: recipientName(profile),
          studentId: students.some((student) => student.id === seed.about)
            ? seed.about
            : "",
        }
      : undefined;
  return <ComposeForm preset={preset} {...props} />;
}

export function ComposeMessage({
  initial,
  seed,
  onSaved,
  onSent,
  onClose,
}: {
  initial?: SavedDraft;
  seed?: ComposeSeed;
  onSaved: (id: string) => void;
  onSent: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title={m.messagesCompose()}
        description={m.commComposeDescription()}
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        {seed && !initial ? (
          <SeededComposeForm
            seed={seed}
            onSaved={onSaved}
            onSent={onSent}
            onClose={onClose}
          />
        ) : (
          <ComposeForm
            initial={initial}
            onSaved={onSaved}
            onSent={onSent}
            onClose={onClose}
          />
        )}
      </Suspense>
    </div>
  );
}
