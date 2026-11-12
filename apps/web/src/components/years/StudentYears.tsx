import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import {
  Fact,
  Facts,
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusText } from "@faridalms/ui/system/status";
import { Value } from "@faridalms/ui/system/value";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import type {
  StudentEditorPartProps,
  StudentPartProps,
} from "~/components/people/slots";

import { labelOf, lastDay } from "~/components/people/format";
import { ShownValue } from "~/components/people/StudentEditor";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { peopleOptionsQuery, studentRecordQuery } from "~/queries/students";
import { placementsQuery, yearOptionsQuery } from "~/queries/years";
import { saveStudent } from "~/server/students";
import { saveArrival } from "~/server/years";
import { formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { namesFrom, namesInput } from "../people/fields";

type Placements = Awaited<
  ReturnType<NonNullable<ReturnType<typeof placementsQuery>["queryFn"]>>
>;

function labelIn(
  list: readonly {
    id: string;
    labelEn: string | null;
    labelAr: string | null;
  }[],
  id: string | null,
) {
  return labelOf(list.find((row) => row.id === id) ?? null);
}

function useLabels() {
  const people = useSuspenseQuery(peopleOptionsQuery).data;
  const years = useSuspenseQuery(yearOptionsQuery).data;
  return {
    years,
    grade: (id: string | null) => labelIn(people.grades, id),
    entry: (id: string | null) => labelIn(years.entryTypes, id),
    exit: (id: string | null) => labelIn(years.exitTypes, id),
    open: (yearId: string | undefined) =>
      years.years.some(
        (year) => year.id === yearId && year.lifecycle !== "closed",
      ),
  };
}

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

interface PlacementSectionProps {
  placements: Placements;
  onEdit?: () => void;
}

function PlacementSection({ placements, onEdit }: PlacementSectionProps) {
  const labels = useLabels();
  const placement = placements.current;
  return (
    <RecordSection
      title={m.studentPlacement()}
      edit={
        onEdit ? { label: m.studentChangeGrade(), onClick: onEdit } : undefined
      }
    >
      <Facts>
        <Fact label={m.studentSchoolYear()} notApplicable={!placement}>
          {placement
            ? inLocale(placement.yearTitleEn, placement.yearTitleAr)
            : null}
        </Fact>
        <Fact label={m.studentGrade()} notApplicable={!placement}>
          {placement ? labels.grade(placement.gradeId) : null}
        </Fact>
        <Fact label={m.enrollmentStarts()} notApplicable={!placement}>
          {placement ? formatDate(placement.from) : null}
        </Fact>
      </Facts>
    </RecordSection>
  );
}

/** A student's placement in the school's years, on their record's overview. */
export function StudentYearOverview({ student }: StudentPartProps) {
  const placements = useSuspenseQuery(placementsQuery(student.id)).data;
  return <PlacementSection placements={placements} />;
}

/** A student's placements over the years, below their classes. */
export function StudentYearHistory({ student, today }: StudentPartProps) {
  const labels = useLabels();
  const { placements } = useSuspenseQuery(placementsQuery(student.id)).data;
  return (
    <RecordSection
      title={m.enrollmentHistoryTitle()}
      description={m.studentPlacementHistoryHint()}
    >
      {placements.length === 0 ? (
        <RecordEmpty>{m.enrollmentHistoryEmpty()}</RecordEmpty>
      ) : (
        <RecordList>
          {placements.map((placement) => {
            const current = placement.from <= today && today < placement.to;
            return (
              <li
                key={placement.id}
                className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-3"
              >
                <div className="grid min-w-0 gap-0.5">
                  <span className="flex flex-wrap items-center gap-x-3 text-sm leading-5 font-medium">
                    <Value>{labels.grade(placement.gradeId)}</Value>
                    {current ? (
                      <StatusText tone="success">
                        {m.enrollmentCurrent()}
                      </StatusText>
                    ) : null}
                  </span>
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {[
                      inLocale(placement.yearTitleEn, placement.yearTitleAr),
                      placement.exitTypeId
                        ? labels.exit(placement.exitTypeId)
                        : null,
                    ]
                      .filter((part) => part !== null)
                      .join(" · ")}
                  </span>
                </div>
                <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm leading-5">
                  <div>
                    <dt className="text-[13px] leading-[18px] text-muted-foreground">
                      {m.enrollmentStarts()}
                    </dt>
                    <dd className="mt-0.5">{formatDate(placement.from)}</dd>
                  </div>
                  <div>
                    <dt className="text-[13px] leading-[18px] text-muted-foreground">
                      {m.enrollmentEnds()}
                    </dt>
                    <dd className="mt-0.5">
                      {formatDate(lastDay(placement.to))}
                    </dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </RecordList>
      )}
    </RecordSection>
  );
}

/**
 * Where a student is placed, with a change of grade in the working year,
 * and how they came to the school, from their first placement here.
 */
export function StudentYearAside({ student, manage }: StudentPartProps) {
  const labels = useLabels();
  const placements = useSuspenseQuery(placementsQuery(student.id)).data;
  const [sheet, setSheet] = useState<{
    which: "grade" | "arrival" | null;
    key: number;
  }>({ which: null, key: 0 });
  const open = (which: "grade" | "arrival") => () =>
    setSheet((current) => ({ which, key: current.key + 1 }));
  const close = () => setSheet((current) => ({ ...current, which: null }));
  const first = placements.placements.at(-1);
  const gone =
    Boolean(placements.placements[0]?.exitTypeId) && !placements.current;
  return (
    <>
      {gone ? null : (
        <PlacementSection
          placements={placements}
          onEdit={
            manage && placements.workingYearId ? open("grade") : undefined
          }
        />
      )}
      {first ? (
        <RecordSection
          title={m.arrivalTitle()}
          edit={
            manage && labels.open(first.schoolYearId)
              ? { label: m.arrivalEdit(), onClick: open("arrival") }
              : undefined
          }
        >
          <Facts>
            <Fact label={m.arrivalJoinedOn()}>{formatDate(first.from)}</Fact>
            <Fact label={m.arrivalJoinedAs()}>
              {labels.entry(first.entryTypeId)}
            </Fact>
            <Fact label={m.arrivalPreviousSchool()}>
              {first.previousSchool ? (
                <span dir="auto">{first.previousSchool}</span>
              ) : null}
            </Fact>
          </Facts>
        </RecordSection>
      ) : null}
      {sheet.which === "grade" ? (
        <GradeSheet
          key={sheet.key}
          studentId={student.id}
          placements={placements}
          onClose={close}
        />
      ) : null}
      {sheet.which === "arrival" && first ? (
        <ArrivalSheet
          key={sheet.key}
          studentId={student.id}
          placement={first}
          onClose={close}
        />
      ) : null}
    </>
  );
}

interface GradeSheetProps {
  studentId: string;
  placements: Placements;
  onClose: () => void;
}

/** Places a student in a grade in the working year, from today. */
function GradeSheet({ studentId, placements, onClose }: GradeSheetProps) {
  const people = useSuspenseQuery(peopleOptionsQuery).data;
  const student = useSuspenseQuery(studentRecordQuery(studentId)).data;
  const refresh = useRefresh(studentId);
  const current =
    placements.current?.schoolYearId === placements.workingYearId
      ? placements.current
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
          parts: { year: { gradeId } },
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open
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
        options={people.grades.map((row) => ({
          value: row.id,
          label: labelOf(row) ?? row.code,
        }))}
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

interface ArrivalSheetProps {
  studentId: string;
  placement: Placements["placements"][number];
  onClose: () => void;
}

/**
 * How a student came to the school: as what kind of entrant, and from which
 * school. It is kept on their first placement here.
 */
function ArrivalSheet({ studentId, placement, onClose }: ArrivalSheetProps) {
  const years = useSuspenseQuery(yearOptionsQuery).data;
  const refresh = useRefresh(studentId);
  const [entryTypeId, setEntryTypeId] = useState(placement.entryTypeId ?? "");
  const [previousSchool, setPreviousSchool] = useState(
    placement.previousSchool ?? "",
  );
  const mutation = useMutation({
    mutationFn: () =>
      saveArrival({
        data: {
          studentId,
          placementId: placement.id,
          entryTypeId,
          previousSchool,
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open
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
          ...years.entryTypes.map((row) => ({
            value: row.id,
            label: labelOf(row) ?? row.code,
          })),
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

/**
 * A student's grade in the working year on the student form: chosen for a
 * new student, shown for one already placed, changed on their record.
 */
export function StudentYearField({
  student,
  value,
  onChange,
}: StudentEditorPartProps) {
  const people = useSuspenseQuery(peopleOptionsQuery).data;
  if (student) return <PlacedGrade studentId={student.id} />;
  const gradeId =
    typeof value === "object" && value && "gradeId" in value
      ? String(value.gradeId)
      : "";
  return (
    <SelectField
      id="student-grade"
      label={m.studentGrade()}
      optional
      hint={m.studentGradeHint()}
      value={gradeId || "none"}
      options={[
        ...people.grades.map((row) => ({
          value: row.id,
          label: labelOf(row) ?? row.code,
        })),
        { value: "none", label: m.studentNotPlacedYet() },
      ]}
      onChange={(next) => onChange({ gradeId: next === "none" ? "" : next })}
      width="name"
    />
  );
}

interface PlacedGradeProps {
  studentId: string;
}

function PlacedGrade({ studentId }: PlacedGradeProps) {
  const labels = useLabels();
  const { current } = useSuspenseQuery(placementsQuery(studentId)).data;
  return (
    <ShownValue
      label={m.studentGrade()}
      link={{ id: studentId, tab: "enrollment", label: m.studentChangeGrade() }}
    >
      {current ? labels.grade(current.gradeId) : m.studentStatusUnplaced()}
    </ShownValue>
  );
}

interface PlacedGradeLabelProps {
  placements: Placements;
}

/** The grade a student is placed in today, as the school names it. */
export function PlacedGradeLabel({ placements }: PlacedGradeLabelProps) {
  const labels = useLabels();
  return (
    <Value>
      {placements.current ? labels.grade(placements.current.gradeId) : null}
    </Value>
  );
}

interface ExitLabelProps {
  id: string;
}

/** Why a student left, as the school names it. */
export function ExitLabel({ id }: ExitLabelProps) {
  const labels = useLabels();
  return <Value>{labels.exit(id)}</Value>;
}
