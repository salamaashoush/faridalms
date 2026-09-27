import type { Ref } from "react";

import { STAFF_ROLE_CHOICES } from "@faridalms/domain/people";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { SelectField, TextField } from "~/components/system/field";
import { FormSection, RecordForm } from "~/components/system/RecordForm";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { staffMemberQuery } from "~/queries/staff";
import { peopleOptionsQuery } from "~/queries/students";
import { saveStaff } from "~/server/staff";
import { findGuardians } from "~/server/students";
import { formatList } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { NamesDraft } from "./fields";

import {
  CheckboxRow,
  EMPTY_NAMES,
  hasName,
  NameFields,
  namesFrom,
  namesInput,
} from "./fields";
import { displayName, labelOf, roleLabel } from "./format";

type Member = Awaited<
  ReturnType<NonNullable<ReturnType<typeof staffMemberQuery>["queryFn"]>>
>;
type Found = Awaited<ReturnType<typeof findGuardians>>[number];
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

/** Refusals from the server that are about one field, shown on that field. */
const FIELD_ERRORS: Record<string, Field> = {
  "contact_point.phone_invalid": "phone",
  "contact_point.email_invalid": "email",
};

const EMAIL = /^[^\s@]+@[^\s@]+$/;

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

function Matches({
  people,
  onChoose,
  pending,
  ref,
}: {
  people: Found[];
  onChoose: (id: string) => void;
  pending: boolean;
  ref: Ref<HTMLDivElement>;
}) {
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

export function ExistingStaffEditor({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const member = useSuspenseQuery(staffMemberQuery(id)).data;
  return <StaffEditor member={member} onClose={onClose} />;
}

export function StaffEditor({
  member = null,
  onClose,
}: {
  member?: Member | null;
  onClose: () => void;
}) {
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

  const mutation = useMutation({
    mutationFn: ({
      value,
      existingUserId,
    }: {
      value: Draft;
      existingUserId?: string;
    }) =>
      saveStaff({
        data: {
          ...(member ? { id: member.id, expectedVersion: member.version } : {}),
          ...(existingUserId ? { existingUserId } : {}),
          names: namesInput(value.names),
          email: value.email.trim(),
          phone: value.phone.trim(),
          roles: value.roles,
          positionId: value.positionId,
          titleEn: value.titleEn,
          titleAr: value.titleAr,
        },
      }),
    meta: { inlineError: true },
  });

  const validate = (value: Draft) => {
    const found: typeof errors = {};
    if (!hasName(value.names)) found.names = m.validationNameRequired();
    if (!value.email.trim()) found.email = m.validationRequired();
    else if (!EMAIL.test(value.email.trim())) found.email = m.validationEmail();
    if (value.roles.length === 0) found.roles = m.validationRoleRequired();
    return found;
  };

  const save = async (existingUserId?: string) => {
    try {
      await mutation.mutateAsync({ value: draft, existingUserId });
    } catch (error) {
      const field =
        error instanceof Error ? FIELD_ERRORS[error.message] : undefined;
      if (field) setErrors({ [field]: getMessageFromError(error) });
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
        findGuardians({ data: { email: draft.email.trim(), phone: "" } }),
        draft.phone.trim()
          ? findGuardians({ data: { phone: draft.phone.trim(), email: "" } })
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

  const failure =
    mutation.error &&
    !(mutation.error instanceof Error && FIELD_ERRORS[mutation.error.message])
      ? getMessageFromError(mutation.error)
      : null;

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
