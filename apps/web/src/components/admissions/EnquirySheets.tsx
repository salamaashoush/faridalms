import type {
  CloseReason,
  EnquiryPurpose,
  LoggedEntry,
  ReplyTemplate,
} from "@faridalms/domain/enquiries";

import {
  CLOSE_REASONS,
  ENQUIRY_PURPOSES,
  fillReply,
  LOGGED_ENTRIES,
  LOGGED_SOURCES,
  REPLY_TEMPLATES,
  TEMPLATE_FOR,
} from "@faridalms/domain/enquiries";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import {
  ChoiceField,
  FormField,
  SelectField,
  TextField,
} from "~/components/system/field";
import { Segmented } from "~/components/system/panel";
import { SheetForm } from "~/components/system/SheetForm";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  addEnquiryEntry,
  assignEnquiry,
  logEnquiry,
  moveEnquiry,
  replyToEnquiry,
} from "~/server/admissions";
import { getMessageFromError } from "~/utils/error";

import {
  ENTRY_LABEL,
  PURPOSE_LABEL,
  REASON_LABEL,
  SOURCE_LABEL,
  TEMPLATE_LABEL,
} from "./labels";

export interface StaffOption {
  id: string;
  nameEn: string | null;
  nameAr: string | null;
}

const NOBODY = "none";

const LANGUAGES = () => [
  { value: "en" as const, label: m.admLanguageEn() },
  { value: "ar" as const, label: m.admLanguageAr() },
];

const isEmail = (value: string) =>
  v.safeParse(v.pipe(v.string(), v.email()), value).success;

function staffOptions(staff: readonly StaffOption[]) {
  return [
    { value: NOBODY, label: m.admNobody() },
    ...staff.map((row) => ({
      value: row.id,
      label: inLocale(row.nameEn, row.nameAr),
    })),
  ];
}

/** English or Arabic, as a pair of buttons named by the field's label. */
function LanguageField({
  value,
  hint,
  onChange,
}: {
  value: "en" | "ar";
  hint?: string;
  onChange: (value: "en" | "ar") => void;
}) {
  return (
    <div className="grid justify-items-start gap-2">
      <span className="text-sm leading-5 font-medium">
        {m.admFieldLanguage()}
      </span>
      {hint ? (
        <p className="-mt-1 text-[13px] leading-[18px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <Segmented
        label={m.admFieldLanguage()}
        value={value}
        options={LANGUAGES()}
        onChange={onChange}
      />
    </div>
  );
}

/** Refetches the inbox and the enquiry after a change. */
function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["admissions"] });
}

/**
 * An enquiry taken by phone, at the desk, at an event or from a referral:
 * who it is from and how to reach them, what they asked, and who takes it.
 */
export function LogEnquirySheet({
  open,
  onOpenChange,
  staff,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: readonly StaffOption[];
}) {
  const user = useCurrentUser();
  const refresh = useRefresh();
  const navigate = useNavigate();
  const blank = {
    source: "phone" as (typeof LOGGED_SOURCES)[number],
    purpose: "enquiry" as EnquiryPurpose,
    locale: user.preferredLocale ?? "en",
    name: "",
    email: "",
    phone: "",
    childName: "",
    childYear: "",
    message: "",
    assigneeId: staff.some((row) => row.id === user.id) ? user.id : NOBODY,
  };
  const [form, setForm] = useState(blank);
  const [tried, setTried] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const save = useMutation({
    mutationFn: () =>
      logEnquiry({
        data: {
          ...form,
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          assigneeId: form.assigneeId === NOBODY ? "" : form.assigneeId,
        },
      }),
    meta: { inlineError: true },
  });
  const nameMissing = tried && !form.name.trim();
  const reachMissing = tried && !form.email.trim() && !form.phone.trim();
  const emailInvalid =
    tried && form.email.trim() !== "" && !isEmail(form.email.trim());
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setForm(blank);
          setTried(false);
          save.reset();
        }
        onOpenChange(next);
      }}
      title={m.admLogTitle()}
      submitLabel={m.admLogSave()}
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      onSubmit={async () => {
        setTried(true);
        if (
          !form.name.trim() ||
          (!form.email.trim() && !form.phone.trim()) ||
          (form.email.trim() !== "" && !isEmail(form.email.trim()))
        )
          return;
        let created: { id: string };
        try {
          created = await save.mutateAsync();
        } catch {
          return;
        }
        await refresh();
        toast.success(m.admLogged());
        setForm(blank);
        setTried(false);
        onOpenChange(false);
        await navigate({
          to: "/admissions/enquiries/$enquiryId",
          params: { enquiryId: created.id },
        });
      }}
    >
      <SelectField
        id="enquiry-source"
        label={m.admColSource()}
        value={form.source}
        options={LOGGED_SOURCES.map((value) => ({
          value,
          label: SOURCE_LABEL[value](),
        }))}
        onChange={(value) => set("source", value)}
      />
      <SelectField
        id="enquiry-purpose"
        label={m.admFieldPurpose()}
        value={form.purpose}
        options={ENQUIRY_PURPOSES.map((value) => ({
          value,
          label: PURPOSE_LABEL[value](),
        }))}
        onChange={(value) => set("purpose", value)}
      />
      <TextField
        id="enquiry-name"
        label={m.admFieldName()}
        width="name"
        maxLength={120}
        autoComplete="off"
        value={form.name}
        errors={nameMissing ? [m.validationRequired()] : undefined}
        onChange={(event) => set("name", event.target.value)}
      />
      <TextField
        id="enquiry-email"
        type="email"
        dir="ltr"
        label={m.admFieldEmail()}
        optional
        hint={m.admReachHint()}
        width="name"
        maxLength={254}
        autoComplete="off"
        value={form.email}
        errors={
          emailInvalid
            ? [m.admErrEmail()]
            : reachMissing
              ? [m.admErrReach()]
              : undefined
        }
        onChange={(event) => set("email", event.target.value)}
      />
      <TextField
        id="enquiry-phone"
        type="tel"
        dir="ltr"
        label={m.admFieldPhone()}
        optional
        width="phone"
        maxLength={40}
        autoComplete="off"
        value={form.phone}
        errors={reachMissing ? [m.admErrReach()] : undefined}
        onChange={(event) => set("phone", event.target.value)}
      />
      <TextField
        id="enquiry-child"
        label={m.admFieldChild()}
        optional
        width="name"
        maxLength={120}
        autoComplete="off"
        value={form.childName}
        onChange={(event) => set("childName", event.target.value)}
      />
      <TextField
        id="enquiry-year"
        label={m.admFieldYear()}
        optional
        width="reference"
        maxLength={60}
        autoComplete="off"
        value={form.childYear}
        onChange={(event) => set("childYear", event.target.value)}
      />
      <FormField id="enquiry-message" label={m.admFieldMessage()} optional>
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={4}
            maxLength={2000}
            value={form.message}
            onChange={(event) => set("message", event.target.value)}
          />
        )}
      </FormField>
      <LanguageField
        hint={m.admLanguageHint()}
        value={form.locale}
        onChange={(value) => set("locale", value)}
      />
      <SelectField
        id="enquiry-assignee"
        label={m.admFieldAssignee()}
        value={form.assigneeId}
        options={staffOptions(staff)}
        onChange={(value) => set("assigneeId", value)}
      />
    </SheetForm>
  );
}

export interface EnquiryTarget {
  id: string;
  version: number;
  name: string;
  childName: string;
  purpose: EnquiryPurpose;
  locale: "en" | "ar";
  email: string;
  assignee: StaffOption | null;
  school: { nameEn: string; nameAr: string | null };
}

/**
 * An email to the family, started from a template in the language chosen
 * and edited before it goes. The family's answer reaches the school's own
 * address, and the words stay in the thread.
 */
export function ReplySheet({
  enquiry,
  open,
  onOpenChange,
}: {
  enquiry: EnquiryTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const user = useCurrentUser();
  const refresh = useRefresh();
  const words = (template: ReplyTemplate, locale: "en" | "ar") =>
    fillReply(template, locale, {
      name: enquiry.name,
      child: enquiry.childName,
      school: inLocale(enquiry.school.nameEn, enquiry.school.nameAr, locale),
      sender: inLocale(user.nameEn, user.nameAr, locale),
    });
  const start = () => {
    const template = TEMPLATE_FOR[enquiry.purpose];
    return {
      template,
      locale: enquiry.locale,
      ...words(template, enquiry.locale),
    };
  };
  const [draft, setDraft] = useState(start);
  const [tried, setTried] = useState(false);
  const choose = (template: ReplyTemplate, locale: "en" | "ar") =>
    setDraft({ template, locale, ...words(template, locale) });
  const send = useMutation({
    mutationFn: () =>
      replyToEnquiry({
        data: {
          id: enquiry.id,
          template: draft.template,
          locale: draft.locale,
          subject: draft.subject.trim(),
          body: draft.body.trim(),
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(start());
        else {
          setTried(false);
          send.reset();
        }
        onOpenChange(next);
      }}
      title={m.admReplyTitle({ name: enquiry.name })}
      submitLabel={m.admReplySend()}
      pending={send.isPending}
      error={send.error ? getMessageFromError(send.error) : null}
      onSubmit={async () => {
        setTried(true);
        if (!draft.subject.trim() || !draft.body.trim()) return;
        try {
          await send.mutateAsync();
        } catch {
          return;
        }
        await refresh();
        toast.success(m.admReplySent());
        onOpenChange(false);
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        {m.admReplyTo()}{" "}
        <bdi dir="ltr" className="text-foreground">
          {enquiry.email}
        </bdi>
      </p>
      <SelectField
        id="reply-template"
        label={m.admFieldTemplate()}
        hint={m.admTemplateHint()}
        value={draft.template}
        options={REPLY_TEMPLATES.map((value) => ({
          value,
          label: TEMPLATE_LABEL[value](),
        }))}
        onChange={(value) => choose(value, draft.locale)}
      />
      <LanguageField
        value={draft.locale}
        onChange={(value) => choose(draft.template, value)}
      />
      <TextField
        id="reply-subject"
        label={m.admFieldSubject()}
        maxLength={200}
        lang={draft.locale}
        value={draft.subject}
        errors={
          tried && !draft.subject.trim() ? [m.validationRequired()] : undefined
        }
        onChange={(event) =>
          setDraft((previous) => ({ ...previous, subject: event.target.value }))
        }
      />
      <FormField
        id="reply-body"
        label={m.admFieldBody()}
        errors={
          tried && !draft.body.trim() ? [m.validationRequired()] : undefined
        }
      >
        {(control) => (
          <Textarea
            {...control}
            lang={draft.locale}
            dir={draft.locale === "ar" ? "rtl" : "ltr"}
            rows={14}
            maxLength={5000}
            value={draft.body}
            onChange={(event) =>
              setDraft((previous) => ({
                ...previous,
                body: event.target.value,
              }))
            }
          />
        )}
      </FormField>
    </SheetForm>
  );
}

/** A call, email or meeting that happened outside the app, or a note for colleagues. */
export function EntrySheet({
  enquiry,
  open,
  onOpenChange,
}: {
  enquiry: EnquiryTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const refresh = useRefresh();
  const [kind, setKind] = useState<LoggedEntry>("call");
  const [body, setBody] = useState("");
  const [tried, setTried] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      addEnquiryEntry({ data: { id: enquiry.id, kind, body: body.trim() } }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setBody("");
          setKind("call");
          setTried(false);
          save.reset();
        }
        onOpenChange(next);
      }}
      title={m.admEntryTitle()}
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      onSubmit={async () => {
        setTried(true);
        if (!body.trim()) return;
        try {
          await save.mutateAsync();
        } catch {
          return;
        }
        await refresh();
        toast.success(m.admEntrySaved());
        setBody("");
        setTried(false);
        onOpenChange(false);
      }}
    >
      <ChoiceField
        label={m.admEntryKind()}
        value={kind}
        options={LOGGED_ENTRIES.filter((value) => value !== "note").map(
          (value) => ({ value, label: ENTRY_LABEL[value]() }),
        )}
        onChange={setKind}
      />
      <FormField
        id="entry-body"
        label={m.admEntryBody()}
        hint={m.admEntryHint()}
        errors={tried && !body.trim() ? [m.validationRequired()] : undefined}
      >
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={6}
            maxLength={4000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        )}
      </FormField>
    </SheetForm>
  );
}

/** Hands the enquiry to someone who works enquiries, or to nobody. */
export function AssignSheet({
  enquiry,
  staff,
  open,
  onOpenChange,
}: {
  enquiry: EnquiryTarget;
  staff: readonly StaffOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const refresh = useRefresh();
  const [chosen, setChosen] = useState(enquiry.assignee?.id ?? NOBODY);
  const save = useMutation({
    mutationFn: () =>
      assignEnquiry({
        data: {
          id: enquiry.id,
          expectedVersion: enquiry.version,
          assigneeId: chosen === NOBODY ? "" : chosen,
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (next) setChosen(enquiry.assignee?.id ?? NOBODY);
        else save.reset();
        onOpenChange(next);
      }}
      title={m.admAssignTitle()}
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      onSubmit={async () => {
        try {
          await save.mutateAsync();
        } catch {
          return;
        }
        await refresh();
        toast.success(m.admAssigned());
        onOpenChange(false);
      }}
    >
      <SelectField
        id="assign-to"
        label={m.admFieldAssignee()}
        hint={m.admAssignHint()}
        value={chosen}
        options={staffOptions(staff)}
        onChange={setChosen}
      />
    </SheetForm>
  );
}

/** Ends an enquiry the family did not take further, saying why. */
export function CloseSheet({
  enquiry,
  open,
  onOpenChange,
}: {
  enquiry: EnquiryTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const refresh = useRefresh();
  const [reason, setReason] = useState<CloseReason>("answered");
  const [note, setNote] = useState("");
  const save = useMutation({
    mutationFn: () =>
      moveEnquiry({
        data: {
          id: enquiry.id,
          expectedVersion: enquiry.version,
          state: "closed",
          reason,
          note: note.trim(),
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setNote("");
          save.reset();
        }
        onOpenChange(next);
      }}
      title={m.admCloseTitle()}
      submitLabel={m.admClose()}
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      onSubmit={async () => {
        try {
          await save.mutateAsync();
        } catch {
          return;
        }
        await refresh();
        toast.success(m.admClosed());
        setNote("");
        onOpenChange(false);
      }}
    >
      <SelectField
        id="close-reason"
        label={m.admFieldReason()}
        value={reason}
        options={CLOSE_REASONS.map((value) => ({
          value,
          label: REASON_LABEL[value](),
        }))}
        onChange={setReason}
      />
      <FormField id="close-note" label={m.admFieldNote()} optional>
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </FormField>
    </SheetForm>
  );
}
