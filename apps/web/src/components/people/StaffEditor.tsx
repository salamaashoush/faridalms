import type { Ref } from "react";

import { saveStaffSchema, STAFF_ROLE_CHOICES } from "@faridalms/domain/people";
import { Button } from "@faridalms/ui/button";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { FormSection, RecordForm } from "@faridalms/ui/system/record-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import * as m from "~/i18n/messages";
import { staffMemberQuery } from "~/queries/staff";
import { peopleOptionsQuery } from "~/queries/students";
import { saveStaff } from "~/server/staff";
import { findByContact } from "~/server/students";
import { formatList } from "~/utils/datetime";
import { refusalOf } from "~/utils/error";
import { schemaErrors } from "~/utils/validation";

import type { NamesDraft } from "./fields";

import {
  CheckboxRow,
  EMPTY_NAMES,
  NameFields,
  namesFrom,
  namesInput,
} from "./fields";
import { displayName, labelOf, roleLabel } from "./format";

type Member = Awaited<
  ReturnType<NonNullable<ReturnType<typeof staffMemberQuery>["queryFn"]>>
>;
type Found = Awaited<ReturnType<typeof findByContact>>[number];
type Role = (typeof STAFF_ROLE_CHOICES)[number];

interface Draft {
  names: NamesDraft;
  email: string;
  phone: string;
  roles: Role[];
  positionId: string;
  titleEn: string;
  titleAr: string;
}

type Field = keyof Draft;

const FIELD_OF: Partial<Record<string, Field>> = {
  names: "names",
  email: "email",
  phone: "phone",
  roles: "roles",
};

/** Refusals from the server that are about one field, shown on that field. */
const FIELD_ERRORS: Partial<Record<string, Field>> = {
  "contact_point.phone_invalid": "phone",
  "contact_point.email_invalid": "email",
};

function initialDraft(member: Member | null): Draft {
  if (!member)
    return {
      names: EMPTY_NAMES,
      email: "",
      phone: "",
      roles: ["teacher"],
      positionId: "",
      titleEn: "",
      titleAr: "",
    };
  return {
    names: namesFrom(member),
    email: member.email,
    phone: member.phone,
    roles: member.roles.filter((role): role is Role =>
      STAFF_ROLE_CHOICES.some((choice) => choice === role),
    ),
    positionId: member.positionId,
    titleEn: member.titleEn,
    titleAr: member.titleAr,
  };
}

interface MatchesProps {
  people: Found[];
  onChoose: (id: string) => void;
  pending: boolean;
  ref: Ref<HTMLDivElement>;
}

function Matches({ people, onChoose, pending, ref }: MatchesProps) {
  const titleId = useId();
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      aria-labelledby={titleId}
      className="grid gap-2 rounded-lg border border-warning/60 bg-warning/10 p-4 outline-none focus-visible:ring-3 focus-visible:ring-warning/40"
    >
      <p
        id={titleId}
        className="flex items-start gap-2 text-sm leading-5 font-medium"
      >
        <TriangleAlert
          className="mt-0.5 size-4 shrink-0 text-warning-foreground dark:text-warning"
          aria-hidden
        />
        {m.staffMatchesTitle()}
      </p>
      <ul className="grid gap-1.5 ps-6 text-sm leading-5">
        {people.map((person) => (
          <li
            key={person.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1"
          >
            <Link
              to="/people/$userId"
              params={{ userId: person.id }}
              search={{}}
              dir="auto"
              className="min-w-0 font-medium text-primary underline underline-offset-2"
            >
              {displayName(person)}
            </Link>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="max-md:h-10"
              disabled={pending}
              onClick={() => onChoose(person.id)}
            >
              {m.staffMatchesAdd({ name: displayName(person) })}
            </Button>
          </li>
        ))}
      </ul>
      <p className="ps-6 text-[13px] leading-[18px] text-muted-foreground">
        {m.staffMatchesSaveAgain()}
      </p>
    </div>
  );
}

export interface ExistingStaffEditorProps {
  id: string;
  onClose: () => void;
}

export function ExistingStaffEditor({ id, onClose }: ExistingStaffEditorProps) {
  const member = useSuspenseQuery(staffMemberQuery(id)).data;
  return <StaffEditor member={member} onClose={onClose} />;
}

export interface StaffEditorProps {
  member?: Member | null;
  onClose: () => void;
}

export function StaffEditor({ member = null, onClose }: StaffEditorProps) {
  const adding = member === null;
  const options = useSuspenseQuery(peopleOptionsQuery).data;
  const queryClient = useQueryClient();
  const leaving = useRef(false);
  const [initial] = useState(() => initialDraft(member));
  const [draft, setDraft] = useState<Draft>(initial);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [matches, setMatches] = useState<{
    identity: string;
    people: Found[];
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const notice = useRef<HTMLDivElement>(null);
  const [focusNotice, setFocusNotice] = useState(0);
  const noticeFocused = useRef(0);
  useEffect(() => {
    if (focusNotice === noticeFocused.current) return;
    noticeFocused.current = focusNotice;
    notice.current?.focus();
  }, [focusNotice]);

  const identity = `${draft.email.trim().toLowerCase()}|${draft.phone.trim()}`;
  if (matches && matches.identity !== identity) setMatches(null);

  const set = <K extends Field>(key: K, value: Draft[K]) => {
    setErrors((current) => ({ ...current, [key]: undefined }));
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const payloadOf = (value: Draft, existingUserId?: string) => ({
    ...(member ? { id: member.id, expectedVersion: member.version } : {}),
    ...(existingUserId ? { existingUserId } : {}),
    names: namesInput(value.names),
    email: value.email.trim(),
    phone: value.phone.trim(),
    roles: value.roles,
    positionId: value.positionId,
    titleEn: value.titleEn,
    titleAr: value.titleAr,
  });
  const mutation = useMutation({
    mutationFn: ({
      value,
      existingUserId,
    }: {
      value: Draft;
      existingUserId?: string;
    }) => saveStaff({ data: payloadOf(value, existingUserId) }),
    meta: { inlineError: true },
  });

  const validate = (value: Draft) =>
    schemaErrors(saveStaffSchema, payloadOf(value), (key) => FIELD_OF[key]);

  const save = async (existingUserId?: string) => {
    try {
      await mutation.mutateAsync({ value: draft, existingUserId });
    } catch (error) {
      const refused = refusalOf(error, FIELD_ERRORS);
      if (refused?.field) setErrors({ [refused.field]: refused.message });
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["people"] });
    leaving.current = true;
    toast.success(m.managementSaved());
    onClose();
  };

  const submit = async () => {
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (adding && identity !== matches?.identity) {
      setChecking(true);
      const people = await Promise.all([
        findByContact({ data: { email: draft.email.trim(), phone: "" } }),
        draft.phone.trim()
          ? findByContact({ data: { phone: draft.phone.trim(), email: "" } })
          : Promise.resolve([]),
      ])
        .then(([byEmail, byPhone]) => {
          const seen = new Set<string>();
          return [...byEmail, ...byPhone].filter((person) => {
            if (seen.has(person.id)) return false;
            seen.add(person.id);
            return true;
          });
        })
        .finally(() => setChecking(false));
      if (people.length) {
        setMatches({ identity, people });
        setFocusNotice((count) => count + 1);
        return;
      }
    }
    await save();
  };

  const refusal = refusalOf(mutation.error, FIELD_ERRORS);
  const failure = refusal && !refusal.field ? refusal.message : null;

  return (
    <RecordForm
      title={adding ? m.staffAdd() : m.staffEdit()}
      onSubmit={() => submit()}
      onCancel={onClose}
      isDirty={() =>
        !leaving.current && JSON.stringify(draft) !== JSON.stringify(initial)
      }
      pending={mutation.isPending || checking}
      error={failure}
    >
      <FormSection title={m.staffPersonal()}>
        <NameFields
          idPrefix="staff"
          value={draft.names}
          onChange={(names) => set("names", names)}
          error={errors.names}
        />
      </FormSection>
      <FormSection title={m.staffContact()} description={m.staffContactHint()}>
        <TextField
          id="staff-email"
          label={m.adminEmail()}
          type="email"
          dir="ltr"
          width="name"
          autoComplete="off"
          value={draft.email}
          onChange={(event) => set("email", event.target.value)}
          errors={errors.email ? [errors.email] : undefined}
        />
        <TextField
          id="staff-phone"
          label={m.familyMobile()}
          optional
          type="tel"
          dir="ltr"
          width="phone"
          autoComplete="off"
          value={draft.phone}
          onChange={(event) => set("phone", event.target.value)}
          errors={errors.phone ? [errors.phone] : undefined}
        />
        {matches ? (
          <Matches
            key={matches.identity}
            ref={notice}
            people={matches.people}
            pending={mutation.isPending}
            onChoose={(id) => void save(id)}
          />
        ) : null}
      </FormSection>
      <FormSection title={m.staffWork()}>
        <fieldset
          className="grid gap-3"
          aria-describedby={errors.roles ? "staff-roles-error" : undefined}
        >
          <legend className="mb-1 text-sm leading-5 font-medium">
            {m.staffRoles()}
          </legend>
          {STAFF_ROLE_CHOICES.map((role) => (
            <CheckboxRow
              key={role}
              label={roleLabel(role)}
              checked={draft.roles.includes(role)}
              onChange={(checked) =>
                set(
                  "roles",
                  checked
                    ? STAFF_ROLE_CHOICES.filter(
                        (choice) =>
                          choice === role || draft.roles.includes(choice),
                      )
                    : draft.roles.filter((held) => held !== role),
                )
              }
            />
          ))}
          {errors.roles ? (
            <p
              id="staff-roles-error"
              className="text-[13px] leading-[18px] text-destructive"
            >
              {errors.roles}
            </p>
          ) : null}
          {member?.groupRoles.length ? (
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              {m.staffGroupRoles({
                roles: formatList(member.groupRoles.map(roleLabel)),
              })}
            </p>
          ) : null}
        </fieldset>
        <SelectField
          id="staff-position"
          label={m.staffPosition()}
          optional
          value={draft.positionId || "none"}
          options={[
            ...options.positions.map((row) => ({
              value: row.id,
              label: labelOf(row) ?? row.code,
            })),
            { value: "none", label: m.commonNotRecorded() },
          ]}
          onChange={(value) => set("positionId", value === "none" ? "" : value)}
          width="name"
        />
        <TextField
          id="staff-title-en"
          label={m.staffTitleEnglish()}
          optional
          dir="ltr"
          width="name"
          autoComplete="off"
          value={draft.titleEn}
          onChange={(event) => set("titleEn", event.target.value)}
        />
        <TextField
          id="staff-title-ar"
          label={m.staffTitleArabic()}
          optional
          dir="rtl"
          width="name"
          autoComplete="off"
          value={draft.titleAr}
          onChange={(event) => set("titleAr", event.target.value)}
        />
      </FormSection>
    </RecordForm>
  );
}
