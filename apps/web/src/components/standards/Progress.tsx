import type { MasteryLevel } from "@faridalms/domain/standards";
import type { Column } from "@faridalms/ui/system/data-table";
import type { LucideIcon } from "lucide-react";

import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { RecordSection } from "@faridalms/ui/system/record-page";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  BookOpen,
  ChevronDown,
  ClipboardCheck,
  Eye,
  CircleCheck,
  CircleDashed,
  Contrast,
  ListChecks,
  Minus,
  Target,
  X,
} from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { displayName } from "~/components/people/format";
import { StudentGoals } from "~/components/standards/Goals";
import { ObserveSheet } from "~/components/standards/Observe";
import { inLocale, useCapability } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  classProgressQuery,
  standardSittingsQuery,
  studentProgressQuery,
} from "~/queries/standards";
import { removeObservation } from "~/server/standards";
import { formatDate, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

type ClassData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof classProgressQuery>["queryFn"]>>
>;
type Standard = ClassData["standards"][number];
type Student = ClassData["students"][number];
type Mastery = ClassData["mastery"][number];

const LEVELS: readonly MasteryLevel[] = ["secure", "developing", "beginning"];

const LEVEL: Record<
  MasteryLevel,
  { icon: LucideIcon; tone: string; label: () => string }
> = {
  secure: {
    icon: CircleCheck,
    tone: "text-success",
    label: m.skillsSecure,
  },
  developing: {
    icon: Contrast,
    tone: "text-warning-foreground dark:text-warning",
    label: m.skillsDeveloping,
  },
  beginning: {
    icon: CircleDashed,
    tone: "text-destructive",
    label: m.skillsBeginning,
  },
};

const percent = (score: number) =>
  m.skillsPercent({ value: formatNumber(Math.round(score * 100)) });

/** A level by its shape and colour, so neither alone carries it. */
function MasteryMark({
  mastery,
  labelled = false,
}: {
  mastery: Pick<Mastery, "level" | "score"> | undefined;
  labelled?: boolean;
}) {
  if (!mastery)
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Minus aria-hidden className="size-4" />
        <span className={labelled ? "text-sm leading-5" : "sr-only"}>
          {m.skillsNotYet()}
        </span>
      </span>
    );
  const level = LEVEL[mastery.level];
  return (
    <span className={cn("inline-flex items-center gap-1.5", level.tone)}>
      <level.icon aria-hidden className="size-4 shrink-0" />
      <span
        className={
          labelled ? "text-sm leading-5 font-medium text-foreground" : "sr-only"
        }
      >
        {level.label()}
      </span>
      <span
        className={
          labelled
            ? "text-[13px] leading-[18px] text-muted-foreground tabular-nums"
            : "sr-only"
        }
      >
        {percent(mastery.score)}
      </span>
    </span>
  );
}

function Legend({ unassessed = true }: { unassessed?: boolean }) {
  return (
    <div className="grid gap-1">
      <ul className="flex flex-wrap gap-x-5 gap-y-1">
        {LEVELS.map((level) => {
          const { icon: Icon, tone, label } = LEVEL[level];
          return (
            <li key={level} className="inline-flex items-center gap-1.5">
              <Icon aria-hidden className={cn("size-4", tone)} />
              <span className="text-[13px] leading-[18px]">{label()}</span>
            </li>
          );
        })}
        {unassessed ? (
          <li className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Minus aria-hidden className="size-4" />
            <span className="text-[13px] leading-[18px]">
              {m.skillsNotYet()}
            </span>
          </li>
        ) : null}
      </ul>
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {m.skillsHow()}
      </p>
    </div>
  );
}

function Code({ standard }: { standard: Standard }) {
  return (
    <span className="font-mono text-[13px] font-medium">
      {standard.code || "·"}
    </span>
  );
}

function StandardList({ standards }: { standards: readonly Standard[] }) {
  return (
    <ol className="grid gap-x-6 gap-y-1 text-[13px] leading-[18px] text-muted-foreground md:grid-cols-2">
      {standards.map((standard) => (
        <li key={standard.id} className="flex min-w-0 gap-2">
          <Code standard={standard} />
          <span className="line-clamp-2 min-w-0" dir="auto">
            {standard.statement}
          </span>
        </li>
      ))}
    </ol>
  );
}

const secureOf = (
  mastery: ReadonlyMap<string, Mastery>,
  student: Student,
  standards: readonly Standard[],
) => ({
  count: formatNumber(
    standards.filter(
      (standard) =>
        mastery.get(`${student.id}:${standard.id}`)?.level === "secure",
    ).length,
  ),
  total: formatNumber(standards.length),
});

function StudentName({ row }: { row: Student }) {
  return (
    <RowLink
      to="/students/$studentId"
      params={{ studentId: row.id }}
      search={{ tab: "skills" }}
    >
      <bdi className="font-medium">{displayName(row)}</bdi>
    </RowLink>
  );
}

const studentTitle = (row: Student) => <StudentName row={row} />;

function studentColumns(
  standards: readonly Standard[],
  mastery: ReadonlyMap<string, Mastery>,
): Column<Student>[] {
  return [
    {
      id: "student",
      header: m.lrnStudent(),
      primary: true,
      cell: (row) => <StudentName row={row} />,
    },
    ...standards.map((standard) => ({
      id: standard.id,
      header: standard.code || standard.statement,
      cell: (row: Student) => (
        <MasteryMark mastery={mastery.get(`${row.id}:${standard.id}`)} />
      ),
    })),
    {
      id: "secure",
      header: m.skillsSecureColumn(),
      cell: (row) => (
        <span className="tabular-nums">
          {m.skillsOf(secureOf(mastery, row, standards))}
        </span>
      ),
    },
  ];
}

interface StandardRow extends Standard {
  counts: Record<MasteryLevel | "none", number>;
}

function StandardName({ row }: { row: Standard }) {
  return (
    <span className="flex min-w-0 gap-2">
      <Code standard={row} />
      <span className="line-clamp-2 min-w-0" dir="auto">
        {row.statement}
      </span>
    </span>
  );
}

const standardCard = {
  title: (row: StandardRow) => <StandardName row={row} />,
  fact: (row: StandardRow) =>
    m.skillsCounts({
      secure: formatNumber(row.counts.secure),
      developing: formatNumber(row.counts.developing),
      beginning: formatNumber(row.counts.beginning),
    }),
};

function standardColumns(): Column<StandardRow>[] {
  return [
    {
      id: "standard",
      header: m.skillsStandard(),
      primary: true,
      cell: (row) => <StandardName row={row} />,
    },
    ...[...LEVELS, "none" as const].map((level) => ({
      id: level,
      header: level === "none" ? m.skillsNotYet() : LEVEL[level].label(),
      cell: (row: StandardRow) => (
        <span className="tabular-nums">{formatNumber(row.counts[level])}</span>
      ),
    })),
  ];
}

/**
 * A class's standards as its own lessons and quizzes gave evidence on them:
 * each student against each standard, then each standard across the class,
 * where the ones it has yet to secure stand out.
 */
export function ClassSkills({ classId }: { classId: string }) {
  const data = useSuspenseQuery(classProgressQuery(classId)).data;
  const [observing, setObserving] = useState<string | null>(null);
  if (data.standards.length === 0)
    return (
      <EmptyState
        icon={Target}
        title={m.skillsEmptyTitle()}
        description={m.skillsEmptyBody()}
      />
    );
  const mastery = new Map(
    data.mastery.map((row) => [`${row.studentId}:${row.standardId}`, row]),
  );
  const byStandard: StandardRow[] = data.standards.map((standard) => {
    const counts = { secure: 0, developing: 0, beginning: 0, none: 0 };
    for (const student of data.students)
      counts[mastery.get(`${student.id}:${standard.id}`)?.level ?? "none"] += 1;
    return { ...standard, counts };
  });
  return (
    <div className="grid gap-6">
      <div className="grid gap-4">
        <Legend />
        <StandardList standards={data.standards} />
        {observing ? (
          <ObserveSheet
            key={observing}
            studentId={observing}
            classId={classId}
            open
            onOpenChange={(open) => {
              if (!open) setObserving(null);
            }}
          />
        ) : null}
        <DataTable
          caption={m.skillsByStudent()}
          rows={data.students}
          columns={studentColumns(data.standards, mastery)}
          rowLabel={(row) => displayName(row)}
          rowActions={(row) => [
            {
              label: m.skillsObserve(),
              icon: Eye,
              onSelect: () => setObserving(row.id),
            },
          ]}
          card={{
            title: studentTitle,
            fact: (row) =>
              m.skillsSecureOf(secureOf(mastery, row, data.standards)),
          }}
          empty={{ title: m.lrnNoStudents() }}
        />
      </div>
      <RecordSection title={m.skillsByStandard()} variant="page">
        <DataTable
          caption={m.skillsByStandard()}
          rows={byStandard}
          columns={standardColumns()}
          rowLabel={(row) => row.code || row.statement}
          card={standardCard}
          empty={{ title: m.skillsEmptyTitle() }}
        />
      </RecordSection>
    </div>
  );
}

const SOURCE_ICON: Record<
  "lesson" | "quiz" | "rubric" | "observation",
  LucideIcon
> = {
  lesson: BookOpen,
  quiz: ListChecks,
  rubric: ClipboardCheck,
  observation: Eye,
};

/** Takes back an observation its teacher recorded, from the list it shows in. */
function TakeBack({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const take = useMutation({
    mutationFn: () => removeObservation({ data: { id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["standards"] });
      toast.success(m.skillsObservationRemoved());
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="self-center text-muted-foreground max-md:size-10"
      aria-label={m.skillsObservationRemove()}
      title={m.skillsObservationRemove()}
      disabled={take.isPending}
      onClick={() => take.mutate()}
    >
      <X aria-hidden />
    </Button>
  );
}

/**
 * The lessons, quiz attempts, graded rubrics and observations a mark was
 * worked out from, latest first, each its answers on the standard averaged,
 * as the decaying average reads them.
 */
function Sittings({
  studentId,
  standardId,
}: {
  studentId: string;
  standardId: string;
}) {
  const query = useQuery(standardSittingsQuery(studentId, standardId));
  if (!query.data) return <div aria-busy="true" className="min-h-10" />;
  // A row that can be taken back keeps the others' figures in line with it.
  const removable = query.data.some((sitting) => sitting.observation?.mine);
  return (
    <div className="grid gap-2 rounded-md bg-muted/50 px-3 py-2.5">
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {m.skillsSittingsHint()}
      </p>
      <ol className="grid gap-1.5">
        {query.data.map((sitting) => {
          const Icon = SOURCE_ICON[sitting.source];
          return (
            <li
              key={`${sitting.workId}:${sitting.attempt}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm leading-5"
            >
              <Icon
                aria-hidden
                className="size-4 shrink-0 self-center text-muted-foreground"
              />
              <span dir="auto" className="min-w-0 flex-1 basis-40 font-medium">
                {sitting.title || m.skillsObservation()}
                {sitting.attempt > 1 ? (
                  <span className="font-normal text-muted-foreground">
                    {" · "}
                    {m.skillsSittingAttempt({
                      number: formatNumber(sitting.attempt),
                    })}
                  </span>
                ) : null}
              </span>
              <span className="text-[13px] leading-[18px] text-muted-foreground tabular-nums">
                {sitting.observation
                  ? m.skillsObservedBy({
                      name: inLocale(
                        sitting.observation.byEn,
                        sitting.observation.byAr,
                      ),
                    })
                  : sitting.source === "rubric"
                    ? m.skillsCriteria({ count: sitting.answers })
                    : m.skillsAnswers({ count: sitting.answers })}
                {" · "}
                {formatDate(sitting.at)}
              </span>
              <span className="w-12 text-end tabular-nums">
                {percent(sitting.fraction)}
              </span>
              {sitting.observation?.mine ? (
                <TakeBack id={sitting.workId} />
              ) : removable ? (
                <span aria-hidden className="w-8 shrink-0 max-md:w-10" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** A standard with where the student stands on it, opening onto the work behind it. */
function StandardProgress({
  studentId,
  standard,
  mastery,
}: {
  studentId: string;
  standard: Standard;
  mastery: Mastery | undefined;
}) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <li className="grid gap-2 py-2.5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
        <span className="flex min-w-0 flex-1 basis-64 gap-2 text-sm leading-5">
          <Code standard={standard} />
          <span dir="auto">{standard.statement}</span>
        </span>
        <span className="flex items-center gap-1">
          <MasteryMark mastery={mastery} labelled />
          {mastery ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground max-md:size-10"
              aria-expanded={open}
              aria-controls={panel}
              aria-label={m.skillsSittingsFor({ code: standard.code })}
              onClick={() => setOpen(!open)}
            >
              <ChevronDown
                aria-hidden
                className={cn("transition-transform", open && "rotate-180")}
              />
            </Button>
          ) : null}
        </span>
      </div>
      {open ? (
        <div id={panel}>
          <Sittings studentId={studentId} standardId={standard.id} />
        </div>
      ) : null}
    </li>
  );
}

/** One student's standards, framework by framework, from every class; their teachers record observations here. */
export function StudentSkills({ studentId }: { studentId: string }) {
  const data = useSuspenseQuery(studentProgressQuery(studentId)).data;
  const observes = useCapability("submissions:grade") && studentId !== "";
  const [observing, setObserving] = useState(false);
  const record = observes ? (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="max-md:h-10"
      onClick={() => setObserving(true)}
    >
      <Eye aria-hidden />
      {m.skillsObserve()}
    </Button>
  ) : null;
  const sheet = observes ? (
    <ObserveSheet
      studentId={studentId}
      open={observing}
      onOpenChange={setObserving}
    />
  ) : null;
  if (data.standards.length === 0 && data.goalFrameworks.length === 0)
    return (
      <>
        {sheet}
        <EmptyState
          icon={Target}
          title={m.skillsEmptyTitle()}
          description={m.skillsStudentEmptyBody()}
          action={record}
        />
      </>
    );
  const mastery = new Map(data.mastery.map((row) => [row.standardId, row]));
  const frameworks = new Map<string, Standard[]>();
  for (const standard of data.standards) {
    const list = frameworks.get(standard.frameworkTitle);
    if (list) list.push(standard);
    else frameworks.set(standard.frameworkTitle, [standard]);
  }
  const secure = data.mastery.filter((row) => row.level === "secure").length;
  return (
    <div className="grid gap-6">
      {sheet}
      <StudentGoals
        frameworks={data.goalFrameworks}
        judgements={data.judgements}
      />
      {data.standards.length > 0 ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid min-w-0 flex-1 basis-64 gap-2">
            <p className="text-sm leading-5 font-medium">
              {m.skillsSecureOf({
                count: formatNumber(secure),
                total: formatNumber(data.standards.length),
              })}
            </p>
            <Legend unassessed={false} />
          </div>
          {record}
        </div>
      ) : (
        record
      )}
      {[...frameworks].map(([title, standards]) => (
        <RecordSection key={title} title={title}>
          <ul className="grid divide-y">
            {standards.map((standard) => (
              <StandardProgress
                key={standard.id}
                studentId={studentId}
                standard={standard}
                mastery={mastery.get(standard.id)}
              />
            ))}
          </ul>
        </RecordSection>
      ))}
    </div>
  );
}

/**
 * A student's skills under their grades, for them and their family, once
 * any are assessed; nothing at all before, so a school that tags no
 * questions shows grades alone.
 */
export function SkillsSection({ studentId }: { studentId: string }) {
  const data = useSuspenseQuery(studentProgressQuery(studentId)).data;
  const heading = useId();
  if (data.standards.length === 0 && data.goalFrameworks.length === 0)
    return null;
  return (
    <section aria-labelledby={heading} className="grid gap-4">
      <h2 id={heading} className="text-lg leading-7 font-semibold">
        {m.skillsTab()}
      </h2>
      <StudentSkills studentId={studentId} />
    </section>
  );
}
