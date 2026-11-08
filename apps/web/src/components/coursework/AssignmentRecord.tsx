import type { StudentWorkAction } from "@faridalms/domain/coursework";
import type {
  BatchAction,
  Column,
  RowAction,
} from "@faridalms/ui/system/data-table";
import type { HeaderFact, RecordTab } from "@faridalms/ui/system/record-page";

import { cn } from "@faridalms/ui/cn";
import { DataTable } from "@faridalms/ui/system/data-table";
import { TextField } from "@faridalms/ui/system/form-field";
import {
  Fact,
  Facts,
  phoneLink,
  RecordEmpty,
  RecordHeader,
  RecordTabs,
} from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { SheetPanel } from "@faridalms/ui/system/sheet-panel";
import { StatusText } from "@faridalms/ui/system/status";
import { Value } from "@faridalms/ui/system/value";
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
  Copy,
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
import { useContext, useState } from "react";
import { toast } from "sonner";

import { ContentView } from "~/components/content/ContentView";
import {
  CourseworkMarks,
  courseworkStep,
} from "~/components/exams/Authentication";
import { resultText } from "~/components/grading/format";
import { usePrint } from "~/components/print/usePrint";
import {
  ReaderWidthToggle,
  useReaderWidth,
} from "~/components/system/ReaderWidth";
import * as m from "~/i18n/messages";
import { assignmentRecordQuery } from "~/queries/coursework";
import {
  actOnWork,
  archiveAssignment,
  drawStudentPapers,
  extendDueDates,
  publishAssignment,
} from "~/server/coursework";
import {
  formatInstant,
  formatList,
  formatNumber,
  instantFromLocal,
  localInput,
} from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { classTitle } from "../classes/format";
import { displayName } from "../people/format";
import {
  BriefReading,
  readingOf,
  titleRead,
  useBriefLanguage,
} from "./BriefLanguage";
import { Discussion } from "./Discussion";
import { PHASE_LABEL, PHASE_TONE, STATE_LABEL, STATE_TONE } from "./format";
import { PeerReviewPanel } from "./PeerReview";
import { QuizAnswers } from "./QuizAnswers";
import { UseAgainSheet } from "./UseAgain";

export const RECORD_TABS = [
  "brief",
  "discussion",
  "work",
  "answers",
  "reviews",
] as const;
export type RecordTabValue = (typeof RECORD_TABS)[number];

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof assignmentRecordQuery>["queryFn"]>>
>;
type WorkRow = Data["work"][number] & { id: string };

const when = (iso: string | null) => (iso ? formatInstant(iso) : null);

interface SettingsProps {
  data: Data;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Settings({ data, open, onOpenChange }: SettingsProps) {
  const late = {
    accept: m.courseworkLateAccept(),
    deduct: m.courseworkLateDeductBy({
      percent: formatNumber(data.lateDeductionPercent ?? 0),
    }),
    refuse: m.courseworkLateRefuse(),
  }[data.latePolicy];
  const format = {
    both: m.courseworkFormatBoth(),
    online_and_files: m.courseworkFormatWrittenAndFiles(),
    online: m.courseworkFormatOnline(),
    files: m.courseworkFormatFiles(),
    none: m.courseworkFormatNone(),
    quiz: m.courseworkFormatQuiz(),
    discussion: m.courseworkFormatDiscussion(),
  }[data.submissionFormat];
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
        {data.peerReviews === null ? null : (
          <Fact label={m.peerSection()}>
            {data.peerAnonymous
              ? m.peerHowAnonymous({ count: data.peerReviews })
              : m.peerHowNamed({ count: data.peerReviews })}
          </Fact>
        )}
      </Facts>
    </SheetPanel>
  );
}

interface BriefProps {
  data: Data;
}

function Brief({ data }: BriefProps) {
  const reading = useBriefLanguage({
    title: data.title,
    brief: data.brief,
    language: data.language,
    translation: data.translation,
  });
  return (
    <div className="grid gap-6">
      {reading.switcher}
      {reading.brief ? (
        <div lang={reading.lang} dir={reading.dir}>
          <ContentView
            document={reading.brief}
            fileUrl={(id) => `/files/${id}`}
          />
        </div>
      ) : (
        <RecordEmpty>{m.courseworkNoBrief()}</RecordEmpty>
      )}
    </div>
  );
}

interface StateCellProps {
  row: WorkRow;
}

function StateCell({ row }: StateCellProps) {
  return (
    <span className="grid gap-0.5">
      <StatusText tone={STATE_TONE[row.learnerState]}>
        {STATE_LABEL[row.learnerState]()}
      </StatusText>
      {row.extended && row.dueAt ? (
        <span className="text-[13px] leading-[18px] text-muted-foreground">
          {m.courseworkOwnDue({
            date: formatInstant(row.dueAt),
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

interface ExtendSheetProps {
  data: Data;
  rows: WorkRow[] | null;
  onOpenChange: (open: boolean) => void;
}

/** A due time of their own for the chosen students, on the school's clock. */
function ExtendSheet({ data, rows, onOpenChange }: ExtendSheetProps) {
  const queryClient = useQueryClient();
  const first = rows?.[0];
  const [value, setValue] = useState(() => {
    const due =
      rows?.length === 1 && first?.extended ? first.dueAt : data.dueAt;
    return localInput(due);
  });
  const extend = useMutation({
    mutationFn: () =>
      extendDueDates({
        data: {
          assignmentId: data.id,
          studentIds: (rows ?? []).map((row) => row.studentId),
          dueAt: instantFromLocal(value),
        },
      }),
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
            names: formatList((rows ?? []).map((row) => displayName(row))),
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

interface StudentNameProps {
  row: WorkRow;
}

function StudentName({ row }: StudentNameProps) {
  return <bdi className="font-medium">{displayName(row)}</bdi>;
}

interface ScoreProps {
  row: WorkRow;
  points: number | null;
}

function Score({ row, points }: ScoreProps) {
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

interface HandedAtProps {
  row: WorkRow;
}

function HandedAt({ row }: HandedAtProps) {
  return row.submittedAt ? (
    <Value>
      {formatInstant(row.submittedAt, "stamp")}
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
      cell: (row) => <HandedAt row={row} />,
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

interface WorkProps {
  data: Data;
}

function Work({ data }: WorkProps) {
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
      to: "/grading",
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
        columns={workColumns(data.points, data.assessed)}
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

export interface AssignmentRecordProps {
  assignmentId: string;
  tab: RecordTabValue;
  onTab: (tab: RecordTabValue) => void;
}

export function AssignmentRecord({
  assignmentId,
  tab,
  onTab,
}: AssignmentRecordProps) {
  const data = useSuspenseQuery(assignmentRecordQuery(assignmentId)).data;
  const reading = useContext(BriefReading);
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
  const [reusing, setReusing] = useState({ key: 0, open: false });
  const facts: HeaderFact[] = [];
  if (data.class)
    facts.push({ label: m.studentClass(), value: classTitle(data.class) });
  if (data.dueAt)
    facts.push({
      label: m.courseworkDue(),
      value: m.courseworkDueOn({
        date: formatInstant(data.dueAt),
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
                      date: formatInstant(data.dueAt, "full", locale),
                    },
                    { locale },
                  )
                : null,
            ].filter((fact) => fact !== null),
          content: data.brief,
          answers: data.access.author || data.access.grade,
          link: `/assignments/${data.id}`,
          copies: data.work.map((row) => displayName(row)),
          ...(data.draws
            ? {
                ownPapers: async () => {
                  const { papers } = await drawStudentPapers({
                    data: { id: data.id },
                  });
                  const names = new Map(
                    data.work.map((row) => [row.studentId, displayName(row)]),
                  );
                  return papers.map((paper) => ({
                    name: names.get(paper.studentId) ?? "",
                    content: paper.content,
                  }));
                },
              }
            : {}),
        }
      : null,
  );
  // A quiz's answers only its teacher can judge are marked question by question.
  const byQuestion = data.submissionFormat === "quiz" && data.access.grade;
  const talking = data.submissionFormat === "discussion" && data.access.grade;
  const reviewing = data.peerReviews !== null && data.access.grade;
  const tabs: RecordTab<RecordTabValue>[] = RECORD_TABS.filter(
    (value) =>
      (value !== "answers" || byQuestion) &&
      (value !== "discussion" || talking) &&
      (value !== "reviews" || reviewing),
  ).map((value) => ({
    value,
    label:
      value === "brief"
        ? m.courseworkBrief()
        : value === "answers"
          ? m.lrnAnswersTab()
          : value === "discussion"
            ? m.discussionSection()
            : value === "reviews"
              ? m.peerTab()
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
        title={titleRead(data, readingOf(data, reading?.read))}
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
                    to: "/assignment-editor",
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
                {
                  label: m.courseworkUseAgain(),
                  icon: Copy,
                  onSelect: () =>
                    setReusing((current) => ({
                      key: current.key + 1,
                      open: true,
                    })),
                },
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
        ) : tab === "discussion" && talking ? (
          <Discussion assignmentId={data.id} tab />
        ) : tab === "reviews" && reviewing ? (
          <PeerReviewPanel assignmentId={data.id} />
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
      {reusing.key > 0 ? (
        <UseAgainSheet
          key={reusing.key}
          source={{ id: data.id, title: data.title }}
          classId={data.classId}
          open={reusing.open}
          onClose={() => setReusing((current) => ({ ...current, open: false }))}
        />
      ) : null}
    </div>
  );
}
