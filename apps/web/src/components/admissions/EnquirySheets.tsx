import type { CloseReason, EnquiryPurpose } from "@faridalms/domain/enquiries";

import {
  CLOSE_REASONS,
  ENQUIRY_PURPOSES,
  LOGGED_SOURCES,
} from "@faridalms/domain/enquiries";
import {
  FormField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { Segmented } from "@faridalms/ui/system/panel";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { assignEnquiry, logEnquiry, moveEnquiry } from "~/server/admissions";
import { getMessageFromError } from "~/utils/error";
import { useWords } from "~/utils/words";

import { PURPOSE_LABEL, REASON_LABEL, SOURCE_LABEL } from "./labels";

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

interface LanguageFieldProps {
  value: "en" | "ar";
  hint?: string;
  onChange: (value: "en" | "ar") => void;
}

/** English or Arabic, as a pair of buttons named by the field's label. */
function LanguageField({ value, hint, onChange }: LanguageFieldProps) {
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

export interface LogEnquirySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: readonly StaffOption[];
}

/**
 * An enquiry taken by phone, at the desk, at an event or from a referral:
 * who it is from and how to reach them, what they asked, and who takes it.
 */
export function LogEnquirySheet({
  open,
  onOpenChange,
  staff,
}: LogEnquirySheetProps) {
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

export interface AssignSheetProps {
  enquiry: EnquiryTarget;
  staff: readonly StaffOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Hands the enquiry to someone who works enquiries, or to nobody. */
export function AssignSheet({
  enquiry,
  staff,
  open,
  onOpenChange,
}: AssignSheetProps) {
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

export interface CloseSheetProps {
  enquiry: EnquiryTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Ends an enquiry the family did not take further, saying why. */
export function CloseSheet({ enquiry, open, onOpenChange }: CloseSheetProps) {
  const words = useWords();
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
          label: words(REASON_LABEL[value])(),
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
