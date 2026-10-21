import type { StudentWorkAction } from "@faridalms/domain/coursework";

import { zonedInstant, zonedLocal } from "@faridalms/domain/school";
import { cn } from "@faridalms/ui/cn";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Archive,
  CalendarClock,
  ClipboardPen,
  Download,
  EyeOff,
  Inbox,
  Pencil,
  RotateCcw,
  Send,
  Share2,
  Undo2,
  UserX,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type {
  BatchAction,
  Column,
  RowAction,
} from "~/components/system/DataTable";
import type { HeaderFact, RecordTab } from "~/components/system/RecordPage";

import { Value } from "~/components/app/primitives";
import { ContentView } from "~/components/content/ContentView";
import {
  CourseworkMarks,
  courseworkStep,
} from "~/components/exams/Authentication";
import { resultText } from "~/components/grading/format";
import { usePrint } from "~/components/print/usePrint";
import { DataTable } from "~/components/system/DataTable";
import { TextField } from "~/components/system/field";
import {
  ReaderWidthToggle,
  useReaderWidth,
} from "~/components/system/ReaderWidth";
import {
  Fact,
  Facts,
  phoneLink,
  RecordEmpty,
  RecordHeader,
  RecordTabs,
} from "~/components/system/RecordPage";
import { SheetForm } from "~/components/system/SheetForm";
import { SheetPanel } from "~/components/system/SheetPanel";
import { StatusText } from "~/components/system/status";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { assignmentRecordQuery } from "~/queries/coursework";
import {
  actOnWork,
  archiveAssignment,
  extendDueDates,
  publishAssignment,
} from "~/server/coursework";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { classTitle } from "../classes/format";
import { displayName } from "../people/format";
import {
  formatInstant,
  formatStamp,
  PHASE_LABEL,
  PHASE_TONE,
  STATE_LABEL,
  STATE_TONE,
} from "./format";
import { QuizAnswers } from "./QuizAnswers";

export const RECORD_TABS = ["brief", "work", "answers"] as const;
export type RecordTabValue = (typeof RECORD_TABS)[number];

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof assignmentRecordQuery>["queryFn"]>>
>;
type WorkRow = Data["work"][number] & { id: string };

function Settings({
  data,
  open,
  onOpenChange,
}: {
  data: Data;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const user = useCurrentUser();
  const late = {
    accept: m.courseworkLateAccept(),
    deduct: m.courseworkLateDeductBy({
      percent: formatNumber(data.lateDeductionPercent ?? 0),
    }),
    refuse: m.courseworkLateRefuse(),
  }[data.latePolicy];
  const format = {
    both: m.courseworkFormatBoth(),
    online: m.courseworkFormatOnline(),
    files: m.courseworkFormatFiles(),
    none: m.courseworkFormatNone(),
    quiz: m.courseworkFormatQuiz(),
  }[data.submissionFormat];
  const when = (iso: string | null) =>
    iso ? formatInstant(iso, user.school.timeZone) : null;
  return (
    <SheetPanel
      open={open}
      onOpenChange={onOpenChange}
      title={m.courseworkSettings()}
    >
      <Facts>
        <Fact label={m.courseworkAudience()}>
          {data.audience === "class"
            ? m.courseworkAudienceClass()
            : m.courseworkAudienceSelected()}
        </Fact>
        <Fact label={m.courseworkAvailableFrom()}>
          {when(data.availableFrom) ?? m.courseworkShownNow()}
        </Fact>
        <Fact label={m.courseworkDue()}>
          {when(data.dueAt) ?? m.courseworkNoDueDate()}
        </Fact>
        <Fact label={m.courseworkClosesAt()}>{when(data.closesAt)}</Fact>
        <Fact label={m.courseworkPoints()}>
          {data.points === null
            ? m.courseworkUngraded()
            : formatNumber(data.points)}
        </Fact>
        <Fact label={m.courseworkFormat()}>{format}</Fact>
        <Fact label={m.courseworkLatePolicy()}>{late}</Fact>
        <Fact label={m.courseworkResubmission()}>
          {data.resubmission ? m.commonYes() : m.commonNo()}
        </Fact>
      </Facts>
    </SheetPanel>
  );
}

function Brief({ data }: { data: Data }) {
  return (
    <div className="grid gap-6">
      {data.brief ? (
        <ContentView document={data.brief} fileUrl={(id) => `/files/${id}`} />
      ) : (
        <RecordEmpty>{m.courseworkNoBrief()}</RecordEmpty>
      )}
    </div>
  );
}

function StateCell({ row }: { row: WorkRow }) {
  const user = useCurrentUser();
  return (
    <span className="grid gap-0.5">
      <StatusText tone={STATE_TONE[row.learnerState]}>
        {STATE_LABEL[row.learnerState]()}
      </StatusText>
      {row.extended && row.dueAt ? (
        <span className="text-[13px] leading-[18px] text-muted-foreground">
          {m.courseworkOwnDue({
            date: formatInstant(row.dueAt, user.school.timeZone),
          })}
        </span>
      ) : null}
      {row.held ? (
        <span className="text-[13px] leading-[18px] text-muted-foreground">
          {m.courseworkGradeHeld()}
        </span>
      ) : null}
      {row.awaiting > 0 ? (
        <span className="text-[13px] leading-[18px] font-medium text-amber-700 dark:text-amber-300">
          {m.courseworkAwaitingReply()}
        </span>
      ) : null}
    </span>
  );
}

/** A due time of their own for the chosen students, on the school's clock. */
function ExtendSheet({
  data,
  rows,
  onOpenChange,
}: {
  data: Data;
  rows: WorkRow[] | null;
  onOpenChange: (open: boolean) => void;
}) {
  const user = useCurrentUser();
  const timeZone = user.school.timeZone;
  const queryClient = useQueryClient();
  const first = rows?.[0];
  const [value, setValue] = useState(() => {
    const due =
      rows?.length === 1 && first?.extended ? first.dueAt : data.dueAt;
    return due ? zonedLocal(due, timeZone) : "";
  });
  const extend = useMutation({
    mutationFn: () => {
      const [date = "", time = "00:00"] = value.split("T");
      return extendDueDates({
        data: {
          assignmentId: data.id,
          studentIds: (rows ?? []).map((row) => row.studentId),
          dueAt: value ? zonedInstant(date, time, timeZone).toISOString() : "",
        },
      });
    },
  });
  return (
    <SheetForm
      open={rows !== null}
      onOpenChange={onOpenChange}
      title={m.courseworkExtend()}
      submitLabel={m.courseworkExtend()}
      pending={extend.isPending}
      error={extend.error ? getMessageFromError(extend.error) : null}
      onSubmit={async () => {
        await extend.mutateAsync();
        await queryClient.invalidateQueries({ queryKey: ["coursework"] });
        toast.success(m.courseworkExtended());
        onOpenChange(false);
      }}
    >
      <div className="grid gap-5">
        <p className="text-sm leading-5 text-muted-foreground">
          {m.courseworkExtendFor({
            names: new Intl.ListFormat(getLocale(), {
              type: "conjunction",
            }).format((rows ?? []).map((row) => displayName(row))),
          })}
        </p>
        <TextField
          id="extend-due"
          label={m.courseworkExtendDue()}
          hint={m.courseworkExtendHint()}
          optional
          type="datetime-local"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
    </SheetForm>
  );
}

function StudentName({ row }: { row: WorkRow }) {
  return <bdi className="font-medium">{displayName(row)}</bdi>;
}

function Score({ row, points }: { row: WorkRow; points: number | null }) {
  if (row.effectiveScore === null && row.score === null)
    return <Value notApplicable>{null}</Value>;
  return (
    <span className="tabular-nums">
      {resultText(
        row.grade,
        row.effectiveScore ?? row.score,
        points,
        "teacher",
      )}
      {row.released ? null : (
        <span className="ms-2 text-[13px] text-muted-foreground">
          {m.courseworkDraftGrade()}
        </span>
      )}
    </span>
  );
}

function HandedAt({ row, timeZone }: { row: WorkRow; timeZone: string }) {
  return row.submittedAt ? (
    <Value>
      {formatStamp(row.submittedAt, timeZone)}
      {row.shared ? (
        <span className="ms-2 text-[13px] text-muted-foreground">
          {m.courseworkSharedMark()}
        </span>
      ) : null}
    </Value>
  ) : (
    <Value notApplicable>{null}</Value>
  );
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function workColumns(
  points: number | null,
  timeZone: string,
  assessed: { declarationRequired: boolean } | null,
): Column<WorkRow>[] {
  return [
    {
      id: "student",
      header: m.courseworkStudent(),
      primary: true,
      cell: (row) => <StudentName row={row} />,
    },
    {
      id: "state",
      header: m.courseworkStatus(),
      cell: (row) => <StateCell row={row} />,
    },
    {
      id: "handed",
      header: m.courseworkHandedInAt(),
      cell: (row) => <HandedAt row={row} timeZone={timeZone} />,
    },
    {
      id: "score",
      header: m.courseworkScore(),
      cell: (row) => <Score row={row} points={points} />,
    },
    ...(assessed
      ? [
          {
            id: "coursework",
            header: m.courseworkAuthenticationColumn(),
            cell: (row: WorkRow) => (
              <CourseworkMarks
                student={{
                  attemptId: row.attemptId,
                  declaration: row.coursework?.declaration ?? null,
                  authentication: row.coursework?.authentication ?? null,
                }}
                declarationRequired={assessed.declarationRequired}
              />
            ),
          },
        ]
      : []),
  ];
}

function workCard(
  points: number | null,
  assessed: { declarationRequired: boolean } | null,
) {
  return {
    title: (row: WorkRow) => <StudentName row={row} />,
    status: (row: WorkRow) => <StateCell row={row} />,
    fact: (row: WorkRow) => {
      const facts = [
        row.score === null
          ? null
          : resultText(
              row.grade,
              row.effectiveScore ?? row.score,
              points,
              "teacher",
            ),
        assessed
          ? courseworkStep(
              {
                attemptId: row.attemptId,
                declaration: row.coursework?.declaration ?? null,
                authentication: row.coursework?.authentication ?? null,
              },
              assessed.declarationRequired,
            )?.label
          : null,
      ].filter(Boolean);
      return facts.length ? facts.join(" · ") : null;
    },
  };
}

function Work({ data }: { data: Data }) {
  const user = useCurrentUser();
  const [extending, setExtending] = useState<WorkRow[] | null>(null);
  // Work done on paper is handed in by the teacher; a quiz only by its student.
  const handsIn =
    data.state === "published" && data.submissionFormat !== "quiz";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const act = useMutation({
    mutationFn: (value: { action: StudentWorkAction; studentIds: string[] }) =>
      actOnWork({ data: { assignmentId: data.id, ...value } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["coursework"] });
    },
  });
  const run = async (
    action: StudentWorkAction,
    rows: WorkRow[],
    done: string,
  ) => {
    try {
      await act.mutateAsync({
        action,
        studentIds: rows.map((row) => row.studentId),
      });
      toast.success(done);
    } catch (error) {
      toast.error(getMessageFromError(error));
    }
  };
  const rows: WorkRow[] = data.work.map((row) => ({
    ...row,
    id: row.studentId,
  }));
  const grade = (row: WorkRow) =>
    void navigate({
      to: "/teach/grading",
      search: { assignmentId: data.id, studentId: row.studentId },
    });
  const batch: BatchAction<WorkRow>[] = data.access.grade
    ? [
        {
          label: m.courseworkReturn(),
          icon: Send,
          onSelect: (selected) =>
            run("return", selected, m.courseworkReturnedDone()),
        },
        {
          label: m.courseworkReturnRevise(),
          icon: RotateCcw,
          onSelect: (selected) =>
            run("revise", selected, m.courseworkRevisionDone()),
        },
        {
          label: m.courseworkExcuse(),
          icon: UserX,
          onSelect: (selected) =>
            run("excuse", selected, m.courseworkExcusedDone()),
        },
        {
          label: m.courseworkShare(),
          icon: Share2,
          onSelect: (selected) =>
            run("share", selected, m.courseworkSharedDone()),
        },
        {
          label: m.courseworkUnshare(),
          icon: EyeOff,
          onSelect: (selected) =>
            run("unshare", selected, m.courseworkUnsharedDone()),
        },
        ...(handsIn
          ? [
              {
                label: m.courseworkHandInFor(),
                icon: Inbox,
                onSelect: (selected: WorkRow[]) =>
                  run("hand_in", selected, m.courseworkHandedInDone()),
              },
            ]
          : []),
        ...(data.access.author && data.state === "published"
          ? [
              {
                label: m.courseworkExtend(),
                icon: CalendarClock,
                onSelect: (selected: WorkRow[]) => setExtending(selected),
              },
            ]
          : []),
      ]
    : [];
  const rowActions = (row: WorkRow): RowAction[] =>
    data.access.grade
      ? [
          ...(row.attemptId
            ? [
                {
                  label: m.courseworkGrade(),
                  icon: ClipboardPen,
                  inline: true,
                  onSelect: () => grade(row),
                },
                row.shared
                  ? {
                      label: m.courseworkUnshare(),
                      icon: EyeOff,
                      onSelect: () =>
                        run("unshare", [row], m.courseworkUnsharedDone()),
                    }
                  : {
                      label: m.courseworkShare(),
                      icon: Share2,
                      onSelect: () =>
                        run("share", [row], m.courseworkSharedDone()),
                    },
              ]
            : []),
          ...(row.excused
            ? [
                {
                  label: m.courseworkUnexcuse(),
                  icon: Undo2,
                  onSelect: () => run("unexcuse", [row], m.managementSaved()),
                },
              ]
            : [
                {
                  label: m.courseworkExcuse(),
                  icon: UserX,
                  onSelect: () =>
                    run("excuse", [row], m.courseworkExcusedDone()),
                },
              ]),
          ...(handsIn &&
          !row.excused &&
          (!row.attemptId || row.released || row.needsRevision)
            ? [
                {
                  label: m.courseworkHandInFor(),
                  icon: Inbox,
                  onSelect: () =>
                    run("hand_in", [row], m.courseworkHandedInDone()),
                },
              ]
            : []),
          ...(data.access.author && data.state === "published"
            ? [
                {
                  label: m.courseworkExtend(),
                  icon: CalendarClock,
                  onSelect: () => setExtending([row]),
                },
              ]
            : []),
        ]
      : [];
  return (
    <>
      <DataTable
        caption={m.courseworkWorkCaption()}
        rows={rows}
        columns={workColumns(data.points, user.school.timeZone, data.assessed)}
        rowLabel={(row) => displayName(row)}
        rowActions={rowActions}
        batchActions={batch}
        card={workCard(data.points, data.assessed)}
        empty={{
          title: m.courseworkNoRecipients(),
          description: m.courseworkNoRecipientsBody(),
        }}
      />
      {extending ? (
        <ExtendSheet
          data={data}
          rows={extending}
          onOpenChange={(open) => {
            if (!open) setExtending(null);
          }}
        />
      ) : null}
    </>
  );
}

export function AssignmentRecord({
  assignmentId,
  tab,
  onTab,
}: {
  assignmentId: string;
  tab: RecordTabValue;
  onTab: (tab: RecordTabValue) => void;
}) {
  const data = useSuspenseQuery(assignmentRecordQuery(assignmentId)).data;
  const user = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["coursework"] });
  const publish = useMutation({
    mutationFn: () =>
      publishAssignment({
        data: { id: data.id, expectedVersion: data.version },
      }),
  });
  const archive = useMutation({
    mutationFn: () =>
      archiveAssignment({
        data: { id: data.id, expectedVersion: data.version },
      }),
  });
  const width = useReaderWidth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const facts: HeaderFact[] = [];
  if (data.class)
    facts.push({ label: m.studentClass(), value: classTitle(data.class) });
  if (data.dueAt)
    facts.push({
      label: m.courseworkDue(),
      value: m.courseworkDueOn({
        date: formatInstant(data.dueAt, user.school.timeZone),
      }),
    });
  if (data.points !== null)
    facts.push({
      label: m.courseworkPoints(),
      value: m.courseworkPointsCount({ count: data.points }),
    });
  facts.push({
    label: m.courseworkSettings(),
    value: (
      <button
        type="button"
        className={cn(
          "font-medium text-primary underline-offset-4 hover:underline",
          phoneLink,
        )}
        onClick={() => setSettingsOpen(true)}
      >
        {m.courseworkSettings()}
      </button>
    ),
  });
  const handedIn = data.work.filter((row) => row.attemptId).length;
  const printing = usePrint(
    data.brief
      ? {
          title: data.title,
          facts: (locale) =>
            [
              data.class ? classTitle(data.class, locale) : null,
              data.dueAt
                ? m.courseworkDueOn(
                    {
                      date: formatInstant(
                        data.dueAt,
                        user.school.timeZone,
                        locale,
                      ),
                    },
                    { locale },
                  )
                : null,
            ].filter((fact) => fact !== null),
          content: data.brief,
          answers: data.access.author || data.access.grade,
          link: `/assignments/${data.id}`,
          copies: data.work.map((row) => displayName(row)),
        }
      : null,
  );
  // A quiz's answers only its teacher can judge are marked question by question.
  const byQuestion = data.submissionFormat === "quiz" && data.access.grade;
  const tabs: RecordTab<RecordTabValue>[] = RECORD_TABS.filter(
    (value) => value !== "answers" || byQuestion,
  ).map((value) => ({
    value,
    label:
      value === "brief"
        ? m.courseworkBrief()
        : value === "answers"
          ? m.lrnAnswersTab()
          : m.courseworkStudentWorkCount({
              count: formatNumber(handedIn),
              total: formatNumber(data.work.length),
            }),
  }));
  return (
    <div
      className={cn(
        "mx-auto w-full",
        width.wide ? "max-w-none" : "max-w-[720px]",
      )}
    >
      <RecordHeader
        variant="document"
        title={data.title}
        facts={facts}
        tools={<ReaderWidthToggle wide={width.wide} onToggle={width.toggle} />}
        status={{
          label: PHASE_LABEL[data.phase](),
          tone: PHASE_TONE[data.phase],
        }}
        action={
          data.access.author && data.state !== "archived"
            ? {
                label: m.courseworkEdit(),
                icon: Pencil,
                onClick: () =>
                  void navigate({
                    to: "/teach/assignment-editor",
                    search: { id: data.id },
                  }),
              }
            : undefined
        }
        menu={[
          ...(printing.action ? [printing.action] : []),
          ...(data.access.author
            ? [
                ...(data.state === "draft"
                  ? [
                      {
                        label: m.courseworkAssign(),
                        icon: Send,
                        onSelect: async () => {
                          try {
                            await publish.mutateAsync();
                            await refresh();
                            toast.success(m.courseworkAssigned());
                          } catch (error) {
                            toast.error(getMessageFromError(error));
                          }
                        },
                      },
                    ]
                  : []),
                ...(data.access.grade && handedIn > 0
                  ? [
                      {
                        label: m.courseworkDownloadAll(),
                        icon: Download,
                        onSelect: () =>
                          window.location.assign(
                            `/exports/assignments/${data.id}`,
                          ),
                      },
                    ]
                  : []),
                ...(data.state !== "archived"
                  ? [
                      {
                        label: m.courseworkArchive(),
                        icon: Archive,
                        onSelect: async () => {
                          try {
                            await archive.mutateAsync();
                            await refresh();
                            toast.success(m.courseworkArchived());
                          } catch (error) {
                            toast.error(getMessageFromError(error));
                          }
                        },
                      },
                    ]
                  : []),
              ]
            : []),
        ]}
      />
      <RecordTabs
        label={m.courseworkRecordSections()}
        tabs={tabs}
        value={tab}
        onChange={onTab}
      >
        {tab === "work" ? (
          <Work data={data} />
        ) : tab === "answers" && byQuestion ? (
          <QuizAnswers assignmentId={data.id} />
        ) : (
          <Brief data={data} />
        )}
      </RecordTabs>
      <Settings
        data={data}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
      {printing.sheet}
    </div>
  );
}
