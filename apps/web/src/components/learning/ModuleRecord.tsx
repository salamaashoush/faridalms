import type { Column, RowAction } from "@faridalms/ui/system/data-table";
import type { Facet } from "@faridalms/ui/system/index-toolbar";
import type { HeaderFact, RecordTab } from "@faridalms/ui/system/record-page";
import type { ReactNode } from "react";

import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { IndexToolbar } from "@faridalms/ui/system/index-toolbar";
import {
  Fact,
  Facts,
  phoneLink,
  RecordColumns,
  RecordHeader,
  RecordSection,
  RecordTabs,
} from "@faridalms/ui/system/record-page";
import { StatusBadge } from "@faridalms/ui/system/status";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  BookMarked,
  Circle,
  CircleCheck,
  CircleDashed,
  ClipboardList,
  Copy,
  EyeOff,
  FileDown,
  Hourglass,
  Layers,
  Package,
  Pencil,
  Plus,
  Radio,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { AreaView } from "~/components/files/AreaFiles";

import { classTitle } from "~/components/classes/format";
import { ContentView } from "~/components/content/ContentView";
import { toolGrading, toolWorkHref } from "~/components/content/lti";
import { SaveTemplateDialog } from "~/components/content/Templates";
import { AreaFiles } from "~/components/files/AreaFiles";
import { displayName } from "~/components/people/format";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  moduleProgressQuery,
  moduleRecordQuery,
  planQuery,
} from "~/queries/learning";
import {
  archiveModule,
  duplicateModule,
  moveLesson,
  openForStudent,
  overrideLesson,
  publishModule,
  removeLesson,
  unpublishModule,
} from "~/server/learning";
import { formatList, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { Answers } from "./Answers";
import { CopyLessonSheet } from "./CopyLesson";
import {
  COMPLETION_LABEL,
  conditionText,
  shownState,
  STATE_LABEL,
  STATE_TONE,
} from "./format";
import { ClassLive } from "./Live";
import { ModuleDiscussions } from "./ModuleDiscussions";
import { ModuleGlossary } from "./ModuleGlossary";
import { TeachLiveDialog } from "./PacedLesson";
import { PlanCoverage } from "./PlanEditor";
import { ClassQuestions } from "./Questions";
import { ClassVideos } from "./Videos";

export const MODULE_TABS = [
  "lessons",
  "plan",
  "live",
  "progress",
  "questions",
  "videos",
  "answers",
  "discussions",
  "files",
] as const;
export type ModuleTab = (typeof MODULE_TABS)[number];

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof moduleRecordQuery>["queryFn"]>>
>;
type Lesson = Data["lessons"][number];
type Progress = Awaited<
  ReturnType<NonNullable<ReturnType<typeof moduleProgressQuery>["queryFn"]>>
>;
type Cell = Progress["cells"][number];
type StudentRow = Progress["students"][number];

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["learning"] });
}

interface LessonTitleProps {
  row: Lesson;
  data: Data;
}

/** The lesson a rule reads its score in, named with its module when that is another. */
function sourceTitle(
  lessonId: string,
  lessons: readonly { id: string; title: string }[],
  sources: readonly { lessonId: string; title: string; moduleTitle: string }[],
) {
  const own = lessons.find((item) => item.id === lessonId);
  if (own) return own.title;
  const other = sources.find((item) => item.lessonId === lessonId);
  return other
    ? m.lrnConditionElsewhere({
        lesson: other.title,
        module: other.moduleTitle,
      })
    : null;
}

function LessonTitle({ row, data }: LessonTitleProps) {
  const before = row.condition
    ? sourceTitle(row.condition.lessonId, data.lessons, data.sources)
    : null;
  const routes = data.routes.filter(
    (item) => item.condition.lessonId === row.id,
  );
  return (
    <span className="grid min-w-0 gap-0.5">
      <RowLink
        to="/lessons/$lessonId"
        params={{ lessonId: row.id }}
        search={{}}
      >
        {row.title}
      </RowLink>
      {row.condition && before ? (
        <span className="text-[13px] leading-[18px] whitespace-normal text-muted-foreground">
          {conditionText(row.condition, before)}
        </span>
      ) : null}
      {routes.map((item) => (
        <span
          key={item.lessonId}
          className="text-[13px] leading-[18px] whitespace-normal text-muted-foreground"
        >
          {m.lrnConditionRoutes({
            lesson: item.title,
            module: item.moduleTitle,
          })}
        </span>
      ))}
      {row.live.length > 0 ? (
        <span className="flex flex-wrap gap-1.5 pt-0.5">
          {row.live.map((session) => {
            const room = data.classes.find(
              (item) => item.id === session.classId,
            );
            const name = room ? classTitle(room) : "";
            return (
              <Link
                key={session.id}
                to="/live/$pacedId"
                params={{ pacedId: session.id }}
                aria-label={m.lrnLiveReturn({ class: name })}
                className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <StatusBadge tone={session.paused ? "warning" : "success"}>
                  {session.paused
                    ? m.lrnLivePausedWith({ class: name })
                    : m.lrnLiveWith({ class: name })}
                </StatusBadge>
              </Link>
            );
          })}
        </span>
      ) : null}
    </span>
  );
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function lessonColumns(data: Data): Column<Lesson>[] {
  return [
    {
      id: "title",
      header: m.lrnLessonTitle(),
      primary: true,
      cell: (row) => (
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="w-5 shrink-0 text-end text-sm text-muted-foreground tabular-nums">
            {formatNumber(row.position + 1)}
          </span>
          <LessonTitle row={row} data={data} />
        </div>
      ),
    },
    {
      id: "completion",
      header: m.lrnCompletion(),
      cell: (row) => COMPLETION_LABEL[row.completion](),
    },
  ];
}

function lessonCard(data: Data) {
  return {
    title: (row: Lesson) => <LessonTitle row={row} data={data} />,
    fact: (row: Lesson) => COMPLETION_LABEL[row.completion](),
  };
}

interface LessonsProps {
  data: Data;
}

function Lessons({ data }: LessonsProps) {
  const navigate = useNavigate();
  const refresh = useRefresh();
  const [copying, setCopying] = useState<{
    lesson: Lesson;
    key: number;
    open: boolean;
  }>();
  const [teaching, setTeaching] = useState<{
    lesson: Lesson;
    key: number;
    open: boolean;
  }>();
  const run = async (action: () => Promise<unknown>, done?: string) => {
    try {
      await action();
      await refresh();
      if (done) toast.success(done);
    } catch (error) {
      toast.error(getMessageFromError(error));
    }
  };
  const editable = data.state !== "archived";
  const rowActions = (row: Lesson): RowAction[] =>
    editable
      ? [
          {
            label: m.lrnEditLesson(),
            icon: Pencil,
            inline: true,
            onSelect: () =>
              navigate({
                to: "/lesson-editor",
                search: { id: row.id, moduleId: data.id },
              }),
          },
          ...(data.open
            ? [
                {
                  label: m.lrnTeachLive(),
                  icon: Radio,
                  onSelect: () =>
                    setTeaching((current) => ({
                      lesson: row,
                      key: (current?.key ?? 0) + 1,
                      open: true,
                    })),
                },
              ]
            : []),
          ...(row.position > 0
            ? [
                {
                  label: m.lrnMoveUp(),
                  icon: ArrowUp,
                  onSelect: () =>
                    run(() =>
                      moveLesson({
                        data: { id: row.id, position: row.position - 1 },
                      }),
                    ),
                },
              ]
            : []),
          ...(row.position < data.lessons.length - 1
            ? [
                {
                  label: m.lrnMoveDown(),
                  icon: ArrowDown,
                  onSelect: () =>
                    run(() =>
                      moveLesson({
                        data: { id: row.id, position: row.position + 1 },
                      }),
                    ),
                },
              ]
            : []),
          {
            label: m.lrnCopyLesson(),
            icon: Copy,
            onSelect: () =>
              setCopying((current) => ({
                lesson: row,
                key: (current?.key ?? 0) + 1,
                open: true,
              })),
          },
          {
            label: m.lrnRemoveLesson(),
            icon: Trash2,
            destructive: true,
            confirm: {
              title: m.lrnRemoveLessonTitle({ title: row.title }),
              body: m.lrnRemoveLessonBody(),
              label: m.lrnRemoveLesson(),
            },
            onSelect: () =>
              run(
                () => removeLesson({ data: { id: row.id } }),
                m.lrnLessonRemoved(),
              ),
          },
        ]
      : [];
  const add = editable ? (
    <ButtonLink
      to="/lesson-editor"
      search={{ moduleId: data.id }}
      variant="outline"
      className="max-md:h-10"
    >
      <Plus aria-hidden />
      {m.lrnAddLesson()}
    </ButtonLink>
  ) : undefined;
  return (
    <div className="grid gap-4">
      {add && data.lessons.length > 0 ? (
        <div className="flex justify-end">{add}</div>
      ) : null}
      <DataTable
        caption={m.lrnLessonsCaption()}
        rows={data.lessons}
        columns={lessonColumns(data)}
        rowLabel={(row) => row.title}
        rowActions={rowActions}
        card={lessonCard(data)}
        empty={{
          icon: Layers,
          title: m.lrnNoLessons(),
          description: m.lrnNoLessonsBody(),
          action: add,
        }}
      />
      {copying ? (
        <CopyLessonSheet
          key={copying.key}
          lesson={copying.lesson}
          module={{ id: data.id, title: data.title }}
          open={copying.open}
          onClose={() =>
            setCopying((current) => current && { ...current, open: false })
          }
        />
      ) : null}
      {teaching ? (
        <TeachLiveDialog
          key={teaching.key}
          lesson={teaching.lesson}
          classes={data.classes}
          open={teaching.open}
          onClose={() =>
            setTeaching((current) => current && { ...current, open: false })
          }
        />
      ) : null}
    </div>
  );
}

interface AboutProps {
  data: Data;
}

function About({ data }: AboutProps) {
  return (
    <RecordSection title={m.lrnAbout()}>
      <Facts>
        <Fact label={m.lrnSummary()} wide>
          {data.summary}
        </Fact>
        <Fact label={m.lrnClasses()} wide>
          {data.classes.map((row) => classTitle(row)).join(", ")}
        </Fact>
        {data.audiences.length > 0 ? (
          <Fact label={m.lrnAudienceFact()} wide>
            {data.audiences
              .map((row) => {
                const taken = data.classes.find(
                  (item) => item.id === row.classId,
                );
                const who = [
                  ...(row.groupIds.length
                    ? [m.lrnAudienceGroups({ count: row.groupIds.length })]
                    : []),
                  ...(row.studentIds.length
                    ? [m.lrnAudienceStudents({ count: row.studentIds.length })]
                    : []),
                ];
                return m.lrnAudienceSome({
                  class: taken ? classTitle(taken) : "",
                  who: formatList(who),
                });
              })
              .join("; ")}
          </Fact>
        ) : null}
        <Fact label={m.lrnOrder()}>
          {data.sequential ? m.lrnInOrder() : m.lrnAnyOrder()}
        </Fact>
        <Fact label={m.lrnPrerequisite()}>
          {data.prerequisiteId ? (
            <Link
              to="/modules/$moduleId"
              params={{ moduleId: data.prerequisiteId }}
              search={{}}
              className={cn(
                "text-primary underline-offset-4 hover:underline",
                phoneLink,
              )}
            >
              <bdi>{data.prerequisiteTitle}</bdi>
            </Link>
          ) : (
            m.lrnNoPrerequisite()
          )}
          {data.prerequisiteId && data.prerequisiteScore ? (
            <span className="text-muted-foreground">
              {" · "}
              {m.lrnPrerequisiteAt({
                score: formatNumber(data.prerequisiteScore),
              })}
            </span>
          ) : null}
        </Fact>
        <Fact label={m.lrnAuthor()}>
          {inLocale(data.authorNameEn, data.authorNameAr)}
        </Fact>
      </Facts>
    </RecordSection>
  );
}

function cellOf(cells: Cell[], lessonId: string, studentId: string) {
  return cells.find(
    (cell) => cell.lessonId === lessonId && cell.studentId === studentId,
  );
}

/** Whether a student's path leaves a lesson out, or waits to decide; undefined when it is on it. */
function pathOf(data: Progress, lessonId: string, studentId: string) {
  return data.paths.find(
    (item) => item.lessonId === lessonId && item.studentId === studentId,
  )?.state;
}

interface CellMarkProps {
  cell: Cell | undefined;
  path: "off" | "pending" | undefined;
  lesson: Progress["lessons"][number];
  student: StudentRow;
  onToggle: (done: boolean) => void;
}

function CellMark({ cell, path, lesson, student, onToggle }: CellMarkProps) {
  const done = Boolean(cell?.completedAt);
  const name = displayName(student);
  if (path === "off")
    return (
      <span
        title={m.lrnCellOffPath()}
        className="inline-grid size-8 place-items-center text-muted-foreground max-md:size-10"
      >
        <span aria-hidden>–</span>
        <span className="sr-only">{m.lrnCellOffPath()}</span>
      </span>
    );
  const state = done
    ? cell?.completedBy === "teacher"
      ? m.lrnCellMarked()
      : m.lrnCellDone()
    : path === "pending"
      ? m.lrnCellWaiting()
      : cell
        ? m.lrnCellStarted()
        : m.lrnCellNotStarted();
  const Icon = done
    ? CircleCheck
    : path === "pending"
      ? Hourglass
      : cell
        ? CircleDashed
        : Circle;
  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="max-md:size-10"
        aria-pressed={done}
        aria-label={m.lrnCellToggle({ lesson: lesson.title, student: name })}
        title={state}
        onClick={() => onToggle(!done)}
      >
        <Icon
          aria-hidden
          className={
            done
              ? cell?.completedBy === "teacher"
                ? "text-info"
                : "text-success"
              : "text-muted-foreground"
          }
        />
      </Button>
      <span className="sr-only">{state}</span>
      {cell?.score === null || cell?.score === undefined ? null : (
        <span className="text-[13px] text-muted-foreground tabular-nums">
          {m.lrnPercent({ value: formatNumber(cell.score) })}
        </span>
      )}
    </div>
  );
}

function doneOf(data: Progress, student: StudentRow) {
  const on = data.lessons.filter(
    (lesson) => pathOf(data, lesson.id, student.id) === undefined,
  );
  const count = on.filter((lesson) =>
    Boolean(cellOf(data.cells, lesson.id, student.id)?.completedAt),
  ).length;
  return m.lrnDoneOf({
    count: formatNumber(count),
    total: formatNumber(on.length),
  });
}

type ToolColumn = Progress["tools"][number];

interface ToolMarkProps {
  data: Progress;
  column: ToolColumn;
  student: StudentRow;
}

/** A student's score in a tool's column, as the tool last reported it. */
function ToolMark({ data, column, student }: ToolMarkProps) {
  const score = data.toolScores.find(
    (row) => row.lineItemId === column.id && row.studentId === student.id,
  );
  const state = score ? toolGrading(score.gradingProgress) : m.ltiNoScore();
  if (score?.result === null || score?.result === undefined)
    return (
      <span title={state} className="text-muted-foreground">
        <span aria-hidden>–</span>
        <span className="sr-only">{state}</span>
      </span>
    );
  const mark = m.ltiScoreOf({
    score: formatNumber(Math.round(score.result * 100) / 100),
    maximum: formatNumber(column.scoreMaximum),
  });
  const className = cn(
    "text-[13px] tabular-nums",
    score.gradingProgress !== "FullyGraded" && "text-muted-foreground",
  );
  // Where the tool can show the work behind the score, the score opens it.
  return column.reviewable ? (
    <a
      href={toolWorkHref(column.id, student.id)}
      target="_blank"
      rel="noopener"
      title={`${state} · ${m.ltiOpenWork()}`}
      className={cn(className, "underline underline-offset-2")}
    >
      {mark}
    </a>
  ) : (
    <span title={state} className={className}>
      {mark}
    </span>
  );
}

interface StudentNameProps {
  row: StudentRow;
}

function StudentName({ row }: StudentNameProps) {
  return <bdi className="font-medium">{displayName(row)}</bdi>;
}

const studentTitle = (row: StudentRow) => <StudentName row={row} />;

function matrixColumns(
  data: Progress,
  onToggle: (lessonId: string, row: StudentRow, done: boolean) => void,
): Column<StudentRow>[] {
  return [
    {
      id: "student",
      header: m.lrnStudent(),
      primary: true,
      cell: (row) => <StudentName row={row} />,
    },
    ...data.lessons.map((lesson, index) => ({
      id: lesson.id,
      header: m.lrnLessonNumber({ number: formatNumber(index + 1) }),
      cell: (row: StudentRow) => (
        <CellMark
          cell={cellOf(data.cells, lesson.id, row.id)}
          path={pathOf(data, lesson.id, row.id)}
          lesson={lesson}
          student={row}
          onToggle={(done) => onToggle(lesson.id, row, done)}
        />
      ),
    })),
    ...data.tools.map((column, index) => ({
      id: column.id,
      header: m.ltiToolColumn({ number: formatNumber(index + 1) }),
      cell: (row: StudentRow) => (
        <ToolMark data={data} column={column} student={row} />
      ),
    })),
    {
      id: "done",
      header: m.lrnDoneColumn(),
      cell: (row) => <span className="tabular-nums">{doneOf(data, row)}</span>,
    },
  ];
}

interface MatrixProps {
  moduleId: string;
  classId: string;
}

function Matrix({ moduleId, classId }: MatrixProps) {
  const refresh = useRefresh();
  const query = useQuery(moduleProgressQuery(moduleId, classId));
  const toggle = useMutation({
    mutationFn: (input: {
      lessonId: string;
      studentId: string;
      completed: boolean;
    }) => overrideLesson({ data: input }),
  });
  if (!query.data) return <div aria-busy="true" className="min-h-40" />;
  const data = query.data;
  const flip = async (lessonId: string, student: StudentRow, done: boolean) => {
    try {
      await toggle.mutateAsync({
        lessonId,
        studentId: student.id,
        completed: done,
      });
      await refresh();
      toast.success(
        done
          ? m.lrnMarkedDone({ student: displayName(student) })
          : m.lrnMarkedUndone({ student: displayName(student) }),
      );
    } catch (error) {
      toast.error(getMessageFromError(error));
    }
  };
  const doneText = (student: StudentRow) => doneOf(data, student);
  const setOpen = async (
    lessonId: string,
    student: StudentRow,
    open: boolean,
  ) => {
    try {
      await openForStudent({
        data: { lessonId, studentId: student.id, open },
      });
      await refresh();
      toast.success(
        (open ? m.lrnOpenedFor : m.lrnClosedFor)({
          student: displayName(student),
        }),
      );
    } catch (error) {
      toast.error(getMessageFromError(error));
    }
  };
  // A lesson a student's path leaves out, or waits to decide, a teacher can
  // open for them; one they opened, take back.
  const rowActions = (row: StudentRow): RowAction[] =>
    data.lessons.flatMap((lesson, index) => {
      const number = formatNumber(index + 1);
      const path = pathOf(data, lesson.id, row.id);
      const opened = data.openings.some(
        (item) => item.lessonId === lesson.id && item.studentId === row.id,
      );
      if (path)
        return [
          {
            label: m.lrnOpenLessonFor({ number }),
            onSelect: () => void setOpen(lesson.id, row, true),
          },
        ];
      const done = Boolean(cellOf(data.cells, lesson.id, row.id)?.completedAt);
      return [
        {
          label: done
            ? m.lrnUndoLesson({ number })
            : m.lrnMarkLesson({ number }),
          onSelect: () => flip(lesson.id, row, !done),
        },
        ...(opened
          ? [
              {
                label: m.lrnCloseLessonFor({ number }),
                onSelect: () => void setOpen(lesson.id, row, false),
              },
            ]
          : []),
      ];
    });
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ol className="flex min-w-0 flex-1 flex-wrap gap-x-6 gap-y-1 text-[13px] leading-[18px] text-muted-foreground">
          {data.lessons.map((lesson, index) => {
            const before = lesson.condition
              ? sourceTitle(
                  lesson.condition.lessonId,
                  data.lessons,
                  data.sources,
                )
              : null;
            return (
              <li key={lesson.id} className="min-w-0">
                {m.lrnLessonNumber({ number: formatNumber(index + 1) })}:{" "}
                <bdi>{lesson.title}</bdi>
                {lesson.condition && before ? (
                  <> · {conditionText(lesson.condition, before)}</>
                ) : null}
              </li>
            );
          })}
          {data.tools.map((column, index) => (
            <li key={column.id} className="min-w-0">
              {m.ltiToolColumn({ number: formatNumber(index + 1) })}:{" "}
              <bdi>{column.label}</bdi> · <bdi>{column.toolName}</bdi>
            </li>
          ))}
        </ol>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-md:h-10"
          onClick={() =>
            window.location.assign(
              `/exports/modules/${moduleId}?as=statements&classId=${classId}`,
            )
          }
        >
          <FileDown aria-hidden />
          {m.lrnExportResults()}
        </Button>
      </div>
      <DataTable
        caption={m.lrnProgressCaption({ title: data.module.title })}
        rows={data.students}
        columns={matrixColumns(data, (lessonId, row, done) => {
          void flip(lessonId, row, done);
        })}
        rowLabel={(row) => displayName(row)}
        rowActions={rowActions}
        card={{ title: studentTitle, fact: doneText }}
        empty={{
          icon: Users,
          title: m.lrnNoStudents(),
          description: m.lrnNoStudentsBody(),
        }}
      />
    </div>
  );
}

interface ClassTabProps {
  data: Data;
  classId: string;
  onClass: (classId: string) => void;
  view: (props: { moduleId: string; classId: string }) => ReactNode;
}

function ClassTab({ data, classId, onClass, view: View }: ClassTabProps) {
  const current = data.classes.some((row) => row.id === classId)
    ? classId
    : (data.classes[0]?.id ?? "");
  if (data.lessons.length === 0)
    return (
      <EmptyState
        icon={Layers}
        title={m.lrnNoLessons()}
        description={m.lrnNoProgressBody()}
      />
    );
  const facet: Facet = {
    id: "class",
    label: m.lrnClass(),
    single: true,
    options: data.classes.map((row) => ({
      value: row.id,
      label: classTitle(row),
    })),
    selected: current ? [current] : [],
    defaultSelected: data.classes[0] ? [data.classes[0].id] : [],
    onChange: ([next = ""]) => onClass(next),
  };
  return (
    <div className="grid gap-4">
      {data.classes.length > 1 ? <IndexToolbar facets={[facet]} /> : null}
      {current ? <View moduleId={data.id} classId={current} /> : null}
    </div>
  );
}

interface ModulePlanProps {
  moduleId: string;
}

/**
 * The module's unit plan as its teachers read it, beside how the questions
 * in its lessons cover the standards it names.
 */
function ModulePlan({ moduleId }: ModulePlanProps) {
  const query = useQuery(planQuery(moduleId));
  const navigate = useNavigate();
  if (!query.data) return <div aria-busy="true" className="min-h-40" />;
  const { content, covered } = query.data;
  const edit = () =>
    void navigate({ to: "/module-plan", search: { moduleId } });
  if (!content)
    return (
      <EmptyState
        icon={ClipboardList}
        title={m.planEmptyTitle()}
        description={m.planEmptyBody()}
        action={
          <Button type="button" className="max-md:h-10" onClick={edit}>
            <Plus aria-hidden />
            {m.planWrite()}
          </Button>
        }
      />
    );
  return (
    <RecordColumns
      main={
        <RecordSection
          title={m.planTitle()}
          action={
            <Button
              type="button"
              variant="ghost"
              className="max-md:h-10"
              onClick={edit}
            >
              <Pencil aria-hidden />
              {m.planEdit()}
            </Button>
          }
        >
          <div className="px-5 pb-5">
            <ContentView document={content} />
          </div>
        </RecordSection>
      }
      aside={<PlanCoverage content={content} covered={covered} />}
    />
  );
}

export interface ModuleRecordProps {
  moduleId: string;
  tab: ModuleTab;
  classId: string;
  onTab: (tab: ModuleTab) => void;
  onClass: (classId: string) => void;
  files: AreaView;
  onFiles: (change: Partial<AreaView>) => void;
}

/** A module for those who teach it: its lessons, and how each student is getting on. */
export function ModuleRecord({
  moduleId,
  tab,
  classId,
  onTab,
  onClass,
  files,
  onFiles,
}: ModuleRecordProps) {
  const data = useSuspenseQuery(moduleRecordQuery(moduleId)).data;
  const navigate = useNavigate();
  const refresh = useRefresh();
  const [sharing, setSharing] = useState(false);
  const user = useCurrentUser();
  // Its discussions are coursework, there where the school sets coursework.
  const discusses =
    user.modules.coursework && user.capabilities.includes("assignments:author");
  const shown = tab === "discussions" && !discusses ? "lessons" : tab;
  const state = shownState(data);
  // The word that it worked comes as the server says so, not once the
  // page has read everything again, which a busy school can make slow.
  const act = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
    } catch (error) {
      toast.error(getMessageFromError(error));
      return;
    }
    toast.success(done);
    await refresh();
  };
  const facts: HeaderFact[] = [
    {
      label: m.lrnClasses(),
      value: data.classes.map((row) => classTitle(row)).join(", "),
    },
    {
      label: m.lrnLessons(),
      value: m.lrnLessonCount({ count: data.lessons.length }),
    },
  ];
  if (data.prerequisiteTitle)
    facts.push({
      label: m.lrnPrerequisite(),
      value: data.prerequisiteScore
        ? `${m.lrnAfter({ title: data.prerequisiteTitle })} · ${m.lrnPrerequisiteAt({ score: formatNumber(data.prerequisiteScore) })}`
        : m.lrnAfter({ title: data.prerequisiteTitle }),
    });
  const tabs: RecordTab<ModuleTab>[] = [
    {
      value: "lessons",
      label: `${m.lrnLessons()} ${formatNumber(data.lessons.length)}`,
    },
    { value: "plan", label: m.planTab() },
    { value: "live", label: m.liveTab() },
    { value: "progress", label: m.lrnProgress() },
    { value: "questions", label: m.lrnQuestionsTab() },
    { value: "videos", label: m.lrnVideosTab() },
    { value: "answers", label: m.lrnAnswersTab() },
    ...(discusses
      ? [{ value: "discussions" as const, label: m.discussionsTab() }]
      : []),
    { value: "files", label: m.filesTab() },
  ];
  const ref = { id: data.id, expectedVersion: data.version };
  return (
    <div className="mx-auto w-full max-w-6xl">
      <RecordHeader
        title={data.title}
        facts={facts}
        status={{ label: STATE_LABEL[state](), tone: STATE_TONE[state] }}
        action={
          data.state !== "archived"
            ? {
                label: m.lrnEditModule(),
                icon: Pencil,
                onClick: () =>
                  void navigate({
                    to: "/module-editor",
                    search: { id: data.id },
                  }),
              }
            : undefined
        }
        menu={[
          ...(data.state === "draft"
            ? [
                {
                  label: m.lrnPublish(),
                  icon: Send,
                  onSelect: () =>
                    act(() => publishModule({ data: ref }), m.lrnPublished()),
                },
              ]
            : []),
          ...(data.state === "published"
            ? [
                {
                  label: m.lrnUnpublish(),
                  icon: EyeOff,
                  onSelect: () =>
                    act(
                      () => unpublishModule({ data: ref }),
                      m.lrnUnpublished(),
                    ),
                },
              ]
            : []),
          {
            label: m.lrnDuplicate(),
            icon: Copy,
            onSelect: async () => {
              try {
                const copy = await duplicateModule({
                  data: {
                    id: data.id,
                    classIds: data.classes.map((row) => row.id),
                  },
                });
                await refresh();
                toast.success(m.lrnDuplicated());
                await navigate({
                  to: "/modules/$moduleId",
                  params: { moduleId: copy.id },
                  search: {},
                });
              } catch (error) {
                toast.error(getMessageFromError(error));
              }
            },
          },
          {
            label: m.tplSaveTitle(),
            icon: BookMarked,
            onSelect: () => setSharing(true),
          },
          {
            label: m.lrnExportCartridge(),
            icon: Package,
            onSelect: () =>
              window.location.assign(
                `/exports/modules/${data.id}?as=cartridge`,
              ),
          },
          {
            label: m.lrnExportQuestions(),
            icon: FileDown,
            onSelect: () =>
              window.location.assign(`/exports/modules/${data.id}?as=qti`),
          },
          {
            label: m.lrnExportCanvasQuizzes(),
            icon: FileDown,
            onSelect: () =>
              window.location.assign(`/exports/modules/${data.id}?as=canvas`),
          },
          ...(data.state !== "archived"
            ? [
                {
                  label: m.lrnArchive(),
                  icon: Archive,
                  destructive: true as const,
                  confirm: {
                    title: m.lrnArchiveTitle({ title: data.title }),
                    body: m.lrnArchiveBody(),
                    label: m.lrnArchive(),
                  },
                  onSelect: () =>
                    act(() => archiveModule({ data: ref }), m.lrnArchived()),
                },
              ]
            : []),
        ]}
      />
      {sharing ? (
        <SaveTemplateDialog
          open={sharing}
          onOpenChange={setSharing}
          piece={{ kind: "module", moduleId: data.id }}
          suggestedTitle={data.title}
        />
      ) : null}
      <RecordTabs
        label={m.lrnSections()}
        tabs={tabs}
        value={shown}
        onChange={onTab}
      >
        {shown === "lessons" ? (
          <RecordColumns
            main={<Lessons data={data} />}
            aside={
              <>
                <About data={data} />
                <ModuleGlossary moduleId={data.id} />
              </>
            }
          />
        ) : shown === "plan" ? (
          <ModulePlan moduleId={data.id} />
        ) : shown === "discussions" ? (
          <ModuleDiscussions
            moduleId={data.id}
            classId={
              data.classes.some((row) => row.id === classId)
                ? classId
                : (data.classes[0]?.id ?? "")
            }
          />
        ) : shown === "files" ? (
          <AreaFiles
            area={{ type: "module", id: data.id }}
            title={data.title}
            view={files}
            onView={onFiles}
          />
        ) : (
          <ClassTab
            data={data}
            classId={classId}
            onClass={onClass}
            view={
              shown === "live"
                ? ClassLive
                : shown === "progress"
                  ? Matrix
                  : shown === "questions"
                    ? ClassQuestions
                    : shown === "videos"
                      ? ClassVideos
                      : Answers
            }
          />
        )}
      </RecordTabs>
    </div>
  );
}
