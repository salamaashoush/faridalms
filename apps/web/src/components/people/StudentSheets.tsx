import { linkRefusal } from "@faridalms/domain/family-roles";
import { Button } from "@faridalms/ui/button";
import { RadioGroup, RadioGroupItem } from "@faridalms/ui/radio-group";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import * as m from "~/i18n/messages";
import { peopleOptionsQuery } from "~/queries/students";
import {
  endRelationship,
  findGuardians,
  saveRelationship,
  saveStudent,
} from "~/server/students";
import { getMessageFromError } from "~/utils/error";

import type { FlagsDraft, NamesDraft } from "./fields";
import type { StudentData } from "./StudentRecord";

import {
  EMPTY_NAMES,
  hasName,
  NameFields,
  namesFrom,
  namesInput,
  PARENT_FLAGS,
  RelationshipFields,
} from "./fields";
import { displayName, labelOf } from "./format";

type Guardian = NonNullable<StudentData["guardians"]>[number];

export type StudentSheet =
  | { kind: "personal" }
  | { kind: "guardian"; guardian: Guardian }
  | { kind: "add-guardian" };

function useRefresh(studentId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["people", "student", studentId],
      }),
      queryClient.invalidateQueries({ queryKey: ["people", "students"] }),
    ]);
}

/** Ends a guardian link from the record's menu; the menu has confirmed it. */
export function useEndLink(studentId: string) {
  const refresh = useRefresh(studentId);
  return async (guardian: Guardian, studentName: string) => {
    await endRelationship({
      data: {
        relationshipId: guardian.relationshipId,
        expectedVersion: guardian.version,
      },
    });
    await refresh();
    toast.success(
      m.guardianLinkEnded({
        name: displayName(guardian),
        student: studentName,
      }),
    );
  };
}

function choices(
  list: {
    id: string;
    labelEn: string | null;
    labelAr: string | null;
    code: string;
  }[],
) {
  return list.map((row) => ({
    value: row.id,
    label: labelOf(row) ?? row.code,
  }));
}

function useOptions() {
  const options = useSuspenseQuery(peopleOptionsQuery).data;
  return {
    relations: choices(options.relations),
    sexes: choices(options.sexes),
    relationByCode: (code: string) =>
      options.relations.find((row) => row.code === code)?.id ?? "",
    meaningOf: (id: string) =>
      options.relations.find((row) => row.id === id)?.meaning ?? null,
  };
}

/** Why the cell would refuse this link, said on its family app access. */
function portalRefusal(
  meaning: string | null,
  link: Parameters<typeof linkRefusal>[1],
) {
  const refused = linkRefusal(meaning, link);
  return refused ? getMessageFromError({ message: refused }) : null;
}

interface PersonalSheetProps {
  student: StudentData;
  open: boolean;
  onClose: () => void;
}

function PersonalSheet({ student, open, onClose }: PersonalSheetProps) {
  const options = useOptions();
  const refresh = useRefresh(student.id);
  const [names, setNames] = useState<NamesDraft>(() => namesFrom(student));
  const [preferred, setPreferred] = useState(student.preferredGivenName ?? "");
  const [birthDate, setBirthDate] = useState(student.birthDate ?? "");
  const [sexId, setSexId] = useState(student.sexId ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      saveStudent({
        data: {
          id: student.id,
          expectedVersion: student.version,
          names: namesInput(names),
          preferredName: preferred,
          reference: student.reference ?? "",
          birthDate,
          sexId,
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.studentEditPersonal()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        if (!hasName(names)) {
          setNameError(m.validationNameRequired());
          return;
        }
        setNameError(null);
        await mutation.mutateAsync().then(
          async () => {
            await refresh();
            toast.success(m.managementSaved());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <NameFields
        idPrefix="sheet"
        value={names}
        onChange={setNames}
        error={nameError}
      />
      <TextField
        id="sheet-preferred"
        label={m.peoplePreferredName()}
        optional
        width="name"
        value={preferred}
        onChange={(event) => setPreferred(event.target.value)}
      />
      <TextField
        id="sheet-birth-date"
        label={m.studentBirthdate()}
        optional
        type="date"
        width="date"
        value={birthDate}
        onChange={(event) => setBirthDate(event.target.value)}
      />
      <SelectField
        id="sheet-sex"
        label={m.peopleSex()}
        optional
        value={sexId || "none"}
        options={[
          ...options.sexes,
          { value: "none", label: m.commonNotRecorded() },
        ]}
        onChange={(value) => setSexId(value === "none" ? "" : value)}
        width="name"
      />
    </SheetForm>
  );
}

function flagsOf(guardian: Guardian): FlagsDraft {
  return {
    relationId: guardian.relationId,
    legalGuardian: guardian.legalGuardian,
    portalAccess: guardian.portalAccess,
    receivesNotifications: guardian.receivesNotifications,
    primaryContact: guardian.primaryContact,
    emergencyContact: guardian.emergencyContact,
    residence: guardian.residence,
    pickup: guardian.pickup,
  };
}

interface GuardianSheetProps {
  student: StudentData;
  guardian: Guardian;
  open: boolean;
  onClose: () => void;
}

function GuardianSheet({
  student,
  guardian,
  open,
  onClose,
}: GuardianSheetProps) {
  const options = useOptions();
  const refresh = useRefresh(student.id);
  const [flags, setFlags] = useState<FlagsDraft>(() => flagsOf(guardian));
  const [portalError, setPortalError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      saveRelationship({
        data: {
          studentId: student.id,
          relationshipId: guardian.relationshipId,
          expectedVersion: guardian.version,
          flags,
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.guardianEditTitle({ name: displayName(guardian) })}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        const refused = portalRefusal(options.meaningOf(flags.relationId), {
          portalAccess: flags.portalAccess,
          educationalRights: guardian.educationalRights,
          accessBasis: guardian.accessBasis,
        });
        setPortalError(refused);
        if (refused) return;
        await mutation.mutateAsync().then(
          async () => {
            await refresh();
            toast.success(m.managementSaved());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <RelationshipFields
        idPrefix="guardian"
        value={flags}
        onChange={(next) => {
          setPortalError(null);
          setFlags(next);
        }}
        relations={options.relations}
        portalError={portalError}
      />
    </SheetForm>
  );
}

type Match = Awaited<ReturnType<typeof findGuardians>>[number];

interface AddGuardianSheetProps {
  student: StudentData;
  open: boolean;
  onClose: () => void;
}

/**
 * Adds a guardian. The phone or email comes first, so someone the school
 * already holds is linked rather than created a second time; a person known
 * only at another school of the group shows as a minimal card.
 */
function AddGuardianSheet({ student, open, onClose }: AddGuardianSheetProps) {
  const options = useOptions();
  const refresh = useRefresh(student.id);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [choice, setChoice] = useState<string>("new");
  const [names, setNames] = useState<NamesDraft>(EMPTY_NAMES);
  const [flags, setFlags] = useState<FlagsDraft>({
    ...PARENT_FLAGS,
    primaryContact: (student.guardians ?? []).length === 0,
    relationId: options.relationByCode("mother"),
  });
  const [errors, setErrors] = useState<{
    names?: string;
    contact?: string;
    portal?: string;
  }>({});
  const [looking, setLooking] = useState(false);
  const lookUp = async () => {
    if (!phone.trim() && !email.trim()) {
      setErrors({ contact: m.guardianContactRequired() });
      return;
    }
    setErrors({});
    setLooking(true);
    try {
      const found = await findGuardians({ data: { phone, email } });
      setMatches(found);
      setChoice(found[0]?.id ?? "new");
    } finally {
      setLooking(false);
    }
  };
  const mutation = useMutation({
    mutationFn: () =>
      saveRelationship({
        data: {
          studentId: student.id,
          ...(choice === "new"
            ? { person: { names: namesInput(names), phone, email } }
            : { existingUserId: choice }),
          flags,
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.guardianAdd()}
      pending={mutation.isPending || looking}
      submitLabel={matches === null ? m.guardianFind() : m.guardianAdd()}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        if (matches === null) {
          await lookUp();
          return;
        }
        const found: typeof errors = {};
        if (choice === "new" && !hasName(names))
          found.names = m.validationNameRequired();
        // A new link starts with full rights on the parents' authority.
        const refused = portalRefusal(options.meaningOf(flags.relationId), {
          portalAccess: flags.portalAccess,
          educationalRights: "full",
          accessBasis: "parental_authority",
        });
        if (refused) found.portal = refused;
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        await mutation.mutateAsync().then(
          async () => {
            await refresh();
            toast.success(m.guardianAdded());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        {m.guardianFindHint()}
      </p>
      <TextField
        id="guardian-phone"
        label={m.familyMobile()}
        type="tel"
        dir="ltr"
        width="phone"
        autoComplete="off"
        value={phone}
        onChange={(event) => {
          setPhone(event.target.value);
          setMatches(null);
        }}
        errors={errors.contact ? [errors.contact] : undefined}
      />
      <TextField
        id="guardian-email"
        label={m.studentEmail()}
        type="email"
        dir="ltr"
        optional
        width="name"
        autoComplete="off"
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
          setMatches(null);
        }}
      />
      {matches === null ? null : (
        <>
          {matches.length > 0 ? (
            <fieldset className="grid gap-3">
              <legend className="mb-1 text-sm leading-5 font-semibold">
                {m.guardianMatches()}
              </legend>
              <RadioGroup
                value={choice}
                onValueChange={(next) => setChoice(String(next))}
              >
                {matches.map((match) => (
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
          ) : (
            <p className="text-sm leading-5">{m.guardianNoMatch()}</p>
          )}
          {choice === "new" ? (
            <NameFields
              idPrefix="guardian"
              value={names}
              onChange={setNames}
              error={errors.names}
            />
          ) : null}
          <RelationshipFields
            idPrefix="new-guardian"
            value={flags}
            onChange={(next) => {
              setErrors((current) => ({ ...current, portal: undefined }));
              setFlags(next);
            }}
            relations={options.relations}
            portalError={errors.portal}
          />
        </>
      )}
      {matches === null ? null : (
        <Button
          type="button"
          variant="ghost"
          className="justify-self-start"
          onClick={() => setMatches(null)}
        >
          {m.guardianSearchAgain()}
        </Button>
      )}
    </SheetForm>
  );
}

export interface StudentSheetsProps {
  student: StudentData;
  sheet: StudentSheet;
  open: boolean;
  onClose: () => void;
}

export function StudentSheets({
  student,
  sheet,
  open,
  onClose,
}: StudentSheetsProps) {
  if (sheet.kind === "personal")
    return <PersonalSheet student={student} open={open} onClose={onClose} />;
  if (sheet.kind === "guardian")
    return (
      <GuardianSheet
        student={student}
        guardian={sheet.guardian}
        open={open}
        onClose={onClose}
      />
    );
  return <AddGuardianSheet student={student} open={open} onClose={onClose} />;
}
