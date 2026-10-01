import type { ReactNode } from "react";

import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
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
  Circle,
  CircleCheck,
  CircleDashed,
  Copy,
  EyeOff,
  Layers,
  Pencil,
  Plus,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import type { Column, RowAction } from "~/components/system/DataTable";
import type { Facet } from "~/components/system/IndexPage";
import type { HeaderFact, RecordTab } from "~/components/system/RecordPage";

import { ButtonLink } from "~/components/app/ButtonLink";
import { classTitle } from "~/components/classes/format";
import { AreaFiles } from "~/components/files/AreaFiles";
import { displayName } from "~/components/people/format";
import { DataTable, RowLink } from "~/components/system/DataTable";
import { EmptyState, IndexToolbar } from "~/components/system/IndexPage";
import {
  Fact,
  Facts,
  phoneLink,
  RecordColumns,
  RecordHeader,
  RecordSection,
  RecordTabs,
} from "~/components/system/RecordPage";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { moduleProgressQuery, moduleRecordQuery } from "~/queries/learning";
import {
  archiveModule,
  duplicateModule,
  moveLesson,
  overrideLesson,
  publishModule,
  removeLesson,
  unpublishModule,
} from "~/server/learning";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { Answers } from "./Answers";
import {
  COMPLETION_LABEL,
  shownState,
  STATE_LABEL,
  STATE_TONE,
} from "./format";
import { ClassQuestions } from "./Questions";

export const MODULE_TABS = [
  "lessons",
  "progress",
  "questions",
  "answers",
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

function LessonTitle({ row }: { row: Lesson }) {
  return (
    <RowLink to="/lessons/$lessonId" params={{ lessonId: row.id }} search={{}}>
      {row.title}
    </RowLink>
  );
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function lessonColumns(): Column<Lesson>[] {
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
          <LessonTitle row={row} />
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

const lessonCard = {
  title: (row: Lesson) => <LessonTitle row={row} />,
  fact: (row: Lesson) => COMPLETION_LABEL[row.completion](),
};

function Lessons({ data }: { data: Data }) {
  const navigate = useNavigate();
  const refresh = useRefresh();
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
                to: "/teach/lesson-editor",
                search: { id: row.id, moduleId: data.id },
              }),
          },
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
      to="/teach/lesson-editor"
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
        columns={lessonColumns()}
        rowLabel={(row) => row.title}
        rowActions={rowActions}
        card={lessonCard}
        empty={{
          icon: Layers,
          title: m.lrnNoLessons(),
          description: m.lrnNoLessonsBody(),
          action: add,
        }}
      />
    </div>
  );
}

function About({ data }: { data: Data }) {
  return (
    <RecordSection title={m.lrnAbout()}>
      <Facts>
        <Fact label={m.lrnSummary()} wide>
          {data.summary}
        </Fact>
        <Fact label={m.lrnClasses()} wide>
          {data.classes.map((row) => classTitle(row)).join(", ")}
        </Fact>
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

function CellMark({
  cell,
  lesson,
  student,
  onToggle,
}: {
  cell: Cell | undefined;
  lesson: Progress["lessons"][number];
  student: StudentRow;
  onToggle: (done: boolean) => void;
}) {
  const done = Boolean(cell?.completedAt);
  const name = displayName(student);
  const state = done
    ? cell?.completedBy === "teacher"
      ? m.lrnCellMarked()
      : m.lrnCellDone()
    : cell
      ? m.lrnCellStarted()
      : m.lrnCellNotStarted();
  const Icon = done ? CircleCheck : cell ? CircleDashed : Circle;
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
  const count = data.lessons.filter((lesson) =>
    Boolean(cellOf(data.cells, lesson.id, student.id)?.completedAt),
  ).length;
  return m.lrnDoneOf({
    count: formatNumber(count),
    total: formatNumber(data.lessons.length),
  });
}

function StudentName({ row }: { row: StudentRow }) {
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
          lesson={lesson}
          student={row}
          onToggle={(done) => onToggle(lesson.id, row, done)}
        />
      ),
    })),
    {
      id: "done",
      header: m.lrnDoneColumn(),
      cell: (row) => <span className="tabular-nums">{doneOf(data, row)}</span>,
    },
  ];
}

function Matrix({ moduleId, classId }: { moduleId: string; classId: string }) {
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
  const rowActions = (row: StudentRow): RowAction[] =>
    data.lessons.map((lesson, index) => {
      const done = Boolean(cellOf(data.cells, lesson.id, row.id)?.completedAt);
      return {
        label: done
          ? m.lrnUndoLesson({ number: formatNumber(index + 1) })
          : m.lrnMarkLesson({ number: formatNumber(index + 1) }),
        onSelect: () => flip(lesson.id, row, !done),
      };
    });
  return (
    <div className="grid gap-4">
      <ol className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] leading-[18px] text-muted-foreground">
        {data.lessons.map((lesson, index) => (
          <li key={lesson.id} className="min-w-0">
            {m.lrnLessonNumber({ number: formatNumber(index + 1) })}:{" "}
            <bdi>{lesson.title}</bdi>
          </li>
        ))}
      </ol>
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

function ClassTab({
  data,
  classId,
  onClass,
  view: View,
}: {
  data: Data;
  classId: string;
  onClass: (classId: string) => void;
  view: (props: { moduleId: string; classId: string }) => ReactNode;
}) {
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

/** A module for those who teach it: its lessons, and how each student is getting on. */
export function ModuleRecord({
  moduleId,
  tab,
  classId,
  onTab,
  onClass,
}: {
  moduleId: string;
  tab: ModuleTab;
  classId: string;
  onTab: (tab: ModuleTab) => void;
  onClass: (classId: string) => void;
}) {
  const data = useSuspenseQuery(moduleRecordQuery(moduleId)).data;
  const navigate = useNavigate();
  const refresh = useRefresh();
  const state = shownState(data);
  const act = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      await refresh();
      toast.success(done);
    } catch (error) {
      toast.error(getMessageFromError(error));
    }
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
      value: m.lrnAfter({ title: data.prerequisiteTitle }),
    });
  const tabs: RecordTab<ModuleTab>[] = [
    {
      value: "lessons",
      label: `${m.lrnLessons()} ${formatNumber(data.lessons.length)}`,
    },
    { value: "progress", label: m.lrnProgress() },
    { value: "questions", label: m.lrnQuestionsTab() },
    { value: "answers", label: m.lrnAnswersTab() },
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
                    to: "/teach/module-editor",
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
      <RecordTabs
        label={m.lrnSections()}
        tabs={tabs}
        value={tab}
        onChange={onTab}
      >
        {tab === "lessons" ? (
          <RecordColumns
            main={<Lessons data={data} />}
            aside={<About data={data} />}
          />
        ) : tab === "files" ? (
          <AreaFiles
            area={{ type: "module", id: data.id }}
            title={data.title}
          />
        ) : (
          <ClassTab
            data={data}
            classId={classId}
            onClass={onClass}
            view={
              tab === "progress"
                ? Matrix
                : tab === "questions"
                  ? ClassQuestions
                  : Answers
            }
          />
        )}
      </RecordTabs>
    </div>
  );
}
