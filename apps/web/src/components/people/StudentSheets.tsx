import { linkRefusal } from "@faridalms/domain/family-roles";
import { Button } from "@faridalms/ui/button";
import { RadioGroup, RadioGroupItem } from "@faridalms/ui/radio-group";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { SelectField, TextField } from "~/components/system/field";
import { SheetForm } from "~/components/system/SheetForm";
import * as m from "~/i18n/messages";
import { peopleOptionsQuery } from "~/queries/students";
import {
  endRelationship,
  findGuardians,
  saveArrival,
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
  | { kind: "grade" }
  | { kind: "arrival" }
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
    grades: choices(options.grades),
    entryTypes: choices(options.entryTypes),
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

function PersonalSheet({
  student,
  open,
  onClose,
}: {
  student: StudentData;
  open: boolean;
  onClose: () => void;
}) {
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

function GradeSheet({
  student,
  open,
  onClose,
}: {
  student: StudentData;
  open: boolean;
  onClose: () => void;
}) {
  const options = useOptions();
  const refresh = useRefresh(student.id);
  const current =
    student.placement?.schoolYearId === student.workingYearId
      ? student.placement
      : null;
  const [gradeId, setGradeId] = useState(current?.gradeId ?? "");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      saveStudent({
        data: {
          id: student.id,
          expectedVersion: student.version,
          names: namesInput(namesFrom(student)),
          preferredName: student.preferredGivenName ?? "",
          reference: student.reference ?? "",
          birthDate: student.birthDate ?? "",
          sexId: student.sexId ?? "",
          gradeId,
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.studentChangeGrade()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        if (!gradeId) {
          setError(m.validationSelection());
          return;
        }
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
      <p className="text-sm leading-5 text-muted-foreground">
        {m.studentChangeGradeHint()}
      </p>
      <SelectField
        id="sheet-grade"
        label={m.studentGrade()}
        value={gradeId}
        options={options.grades}
        onChange={(value) => {
          setError(null);
          setGradeId(value);
        }}
        errors={error ? [error] : undefined}
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

function GuardianSheet({
  student,
  guardian,
  open,
  onClose,
}: {
  student: StudentData;
  guardian: Guardian;
  open: boolean;
  onClose: () => void;
}) {
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

/**
 * Adds a guardian. The phone or email comes first, so someone the school
 * already holds is linked rather than created a second time; a person known
 * only at another school of the group shows as a minimal card.
 */
function AddGuardianSheet({
  student,
  open,
  onClose,
}: {
  student: StudentData;
  open: boolean;
  onClose: () => void;
}) {
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

/**
 * How a student came to the school: as what kind of entrant, and from which
 * school. It is kept on their first placement here.
 */
function ArrivalSheet({
  student,
  open,
  onClose,
}: {
  student: StudentData;
  open: boolean;
  onClose: () => void;
}) {
  const options = useOptions();
  const refresh = useRefresh(student.id);
  const first = student.placements.at(-1);
  const [entryTypeId, setEntryTypeId] = useState(first?.entryTypeId ?? "");
  const [previousSchool, setPreviousSchool] = useState(
    first?.previousSchool ?? "",
  );
  const mutation = useMutation({
    mutationFn: () =>
      saveArrival({
        data: {
          studentId: student.id,
          placementId: first?.id ?? "",
          entryTypeId,
          previousSchool,
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.arrivalEdit()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
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
      <SelectField
        id="sheet-entry-type"
        label={m.arrivalJoinedAs()}
        optional
        value={entryTypeId}
        options={[
          { value: "", label: m.commonNotRecorded() },
          ...options.entryTypes,
        ]}
        onChange={setEntryTypeId}
        width="name"
      />
      <TextField
        id="sheet-previous-school"
        label={m.arrivalPreviousSchool()}
        hint={m.arrivalPreviousSchoolHint()}
        optional
        width="name"
        maxLength={160}
        value={previousSchool}
        onChange={(event) => setPreviousSchool(event.target.value)}
      />
    </SheetForm>
  );
}

export function StudentSheets({
  student,
  sheet,
  open,
  onClose,
}: {
  student: StudentData;
  sheet: StudentSheet;
  open: boolean;
  onClose: () => void;
}) {
  if (sheet.kind === "personal")
    return <PersonalSheet student={student} open={open} onClose={onClose} />;
  if (sheet.kind === "grade")
    return <GradeSheet student={student} open={open} onClose={onClose} />;
  if (sheet.kind === "arrival")
    return <ArrivalSheet student={student} open={open} onClose={onClose} />;
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
