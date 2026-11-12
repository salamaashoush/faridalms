import type { GuardianLinkInput } from "@faridalms/domain/families";

import { Button } from "@faridalms/ui/button";
import { RadioGroup, RadioGroupItem } from "@faridalms/ui/radio-group";
import { TextField } from "@faridalms/ui/system/form-field";
import { Value } from "@faridalms/ui/system/value";
import { Plus, X } from "lucide-react";
import { useId, useRef, useState } from "react";

import type { NamesDraft } from "~/components/people/fields";
import type { StudentEditorPartProps } from "~/components/people/slots";
import type { Guardians, Relations } from "~/queries/families";

import {
  EMPTY_NAMES,
  hasName,
  NameFields,
  namesInput,
} from "~/components/people/fields";
import { displayName, labelOf } from "~/components/people/format";
import { ShownValue } from "~/components/people/StudentEditor";
import * as m from "~/i18n/messages";
import { findByContact } from "~/server/students";
import { formatList } from "~/utils/datetime";

import type { FlagsDraft } from "./fields";

import { PARENT_FLAGS, RelationshipFields } from "./fields";

type Found = Awaited<ReturnType<typeof findByContact>>[number];

export interface GuardianDraft {
  key: number;
  phone: string;
  email: string;
  found: Found[] | null;
  choice: string;
  names: NamesDraft;
  flags: FlagsDraft;
}

/** The guardians to link as the student is first saved, as the form's part sends them. */
export function guardianLinks(
  drafts: readonly GuardianDraft[],
): GuardianLinkInput[] {
  return drafts.map((guardian) =>
    guardian.choice === "new"
      ? {
          person: {
            names: namesInput(guardian.names),
            phone: guardian.phone,
            email: guardian.email,
          },
          flags: guardian.flags,
        }
      : { existingUserId: guardian.choice, flags: guardian.flags },
  );
}

/** Why the guardians cannot be sent yet: someone new is still without a name. */
export function guardiansProblem(value: unknown): string | null {
  return (value as GuardianDraft[]).some(
    (guardian) => guardian.choice === "new" && !hasName(guardian.names),
  )
    ? m.validationNameRequired()
    : null;
}

interface GuardianBlockProps {
  draft: GuardianDraft;
  index: number;
  relations: { value: string; label: string }[];
  onChange: (draft: GuardianDraft) => void;
  onRemove: () => void;
  nameError?: string | null;
}

function GuardianBlock({
  draft,
  index,
  relations,
  onChange,
  onRemove,
  nameError,
}: GuardianBlockProps) {
  const [looking, setLooking] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const legendId = useId();
  const prefix = `guardian-${draft.key}`;
  const lookUp = async () => {
    if (!draft.phone.trim() && !draft.email.trim()) {
      setContactError(m.guardianContactRequired());
      return;
    }
    setContactError(null);
    setLooking(true);
    try {
      const found = await findByContact({
        data: { phone: draft.phone, email: draft.email },
      });
      onChange({ ...draft, found, choice: found[0]?.id ?? "new" });
    } finally {
      setLooking(false);
    }
  };
  return (
    <fieldset
      aria-labelledby={legendId}
      className="grid gap-6 rounded-lg border p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <legend id={legendId} className="text-sm leading-5 font-semibold">
          {m.guardianNumbered({ number: index + 1 })}
        </legend>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={m.guardianRemoveDraft({ number: index + 1 })}
          onClick={onRemove}
        >
          <X aria-hidden />
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          id={`${prefix}-phone`}
          label={m.familyMobile()}
          type="tel"
          dir="ltr"
          width="phone"
          autoComplete="off"
          value={draft.phone}
          onChange={(event) =>
            onChange({ ...draft, phone: event.target.value, found: null })
          }
          errors={contactError ? [contactError] : undefined}
        />
        <Button
          type="button"
          variant="outline"
          disabled={looking}
          onClick={() => void lookUp()}
        >
          {m.guardianFind()}
        </Button>
      </div>
      <TextField
        id={`${prefix}-email`}
        label={m.studentEmail()}
        type="email"
        dir="ltr"
        optional
        width="name"
        autoComplete="off"
        value={draft.email}
        onChange={(event) =>
          onChange({ ...draft, email: event.target.value, found: null })
        }
      />
      {draft.found && draft.found.length > 0 ? (
        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm leading-5 font-medium">
            {m.guardianMatches()}
          </legend>
          <RadioGroup
            value={draft.choice}
            onValueChange={(next) =>
              onChange({ ...draft, choice: String(next) })
            }
          >
            {draft.found.map((match) => (
              <label
                key={match.id}
                className="flex items-center gap-3 text-sm leading-5"
              >
                <RadioGroupItem value={match.id} />
                <span dir="auto">{displayName(match)}</span>
                {match.birthYear ? (
                  <span className="text-muted-foreground">
                    {match.birthYear}
                  </span>
                ) : null}
              </label>
            ))}
            <label className="flex items-center gap-3 text-sm leading-5">
              <RadioGroupItem value="new" />
              {m.guardianSomeoneElse()}
            </label>
          </RadioGroup>
        </fieldset>
      ) : null}
      {draft.choice === "new" ? (
        <NameFields
          idPrefix={prefix}
          value={draft.names}
          onChange={(names) => onChange({ ...draft, names })}
          error={nameError}
        />
      ) : null}
      <RelationshipFields
        idPrefix={prefix}
        value={draft.flags}
        onChange={(flags) => onChange({ ...draft, flags })}
        relations={relations}
      />
    </fieldset>
  );
}

interface NewGuardiansProps {
  relations: Relations;
  value: GuardianDraft[];
  onChange: (value: GuardianDraft[]) => void;
  problem: string | null;
}

/** The guardians entered with a new student, each found by phone or email first. */
function NewGuardians({
  relations,
  value,
  onChange,
  problem,
}: NewGuardiansProps) {
  const nextKey = useRef(1 + Math.max(0, ...value.map((row) => row.key)));
  const choices = relations.map((row) => ({
    value: row.id,
    label: labelOf(row) ?? row.code,
  }));
  const motherId = relations.find((row) => row.code === "mother")?.id ?? "";
  return (
    <>
      {value.map((guardian, index) => (
        <GuardianBlock
          key={guardian.key}
          draft={guardian}
          index={index}
          relations={choices}
          nameError={
            problem && guardian.choice === "new" && !hasName(guardian.names)
              ? problem
              : null
          }
          onChange={(next) =>
            onChange(
              value.map((row) => (row.key === guardian.key ? next : row)),
            )
          }
          onRemove={() =>
            onChange(value.filter((row) => row.key !== guardian.key))
          }
        />
      ))}
      <Button
        type="button"
        variant="outline"
        className="justify-self-start max-md:h-10"
        onClick={() => {
          const key = nextKey.current;
          nextKey.current += 1;
          onChange([
            ...value,
            {
              key,
              phone: "",
              email: "",
              found: null,
              choice: "new",
              names: EMPTY_NAMES,
              flags: {
                ...PARENT_FLAGS,
                primaryContact: value.length === 0,
                relationId: motherId,
              },
            },
          ]);
        }}
      >
        <Plus aria-hidden />
        {value.length ? m.guardianAddAnother() : m.guardianAdd()}
      </Button>
    </>
  );
}

/**
 * The student form's guardians: entered with a new student, and named with
 * a way to the record's family tab for one already saved, where links take
 * their own confirmed steps.
 */
export function StudentGuardiansField({
  read,
  student,
  value,
  onChange,
  problem,
}: StudentEditorPartProps) {
  if (student === null)
    return (
      <NewGuardians
        relations={read as Relations}
        value={value as GuardianDraft[]}
        onChange={onChange}
        problem={problem}
      />
    );
  const names = (read as Guardians).guardians.map((guardian) =>
    displayName(guardian),
  );
  return (
    <ShownValue
      label={m.studentGuardians()}
      link={{
        id: student.id,
        tab: "family",
        label: m.studentEditGuardians(),
      }}
    >
      {names.length ? (
        <span dir="auto">{formatList(names)}</span>
      ) : (
        <Value absent={m.studentNoGuardiansShort()} />
      )}
    </ShownValue>
  );
}
