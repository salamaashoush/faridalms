import type { HeaderFact } from "@faridalms/ui/system/record-page";

import { cn } from "@faridalms/ui/cn";
import { Progress } from "@faridalms/ui/progress";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import {
  phoneLink,
  RecordColumns,
  RecordEmpty,
  RecordHeader,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { StatusText } from "@faridalms/ui/system/status";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { CircleCheck, Lock, Play, Shuffle } from "lucide-react";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { moduleOutlineQuery, myModulesQuery } from "~/queries/learning";
import { formatNumber } from "~/utils/datetime";

import { LESSON_STATE_LABEL, lockedText } from "./format";
import { ModuleGlossary } from "./ModuleGlossary";

type Mine = Awaited<
  ReturnType<NonNullable<ReturnType<typeof myModulesQuery>["queryFn"]>>
>;
type Row = Mine["rows"][number];

const finished = (row: { lessons: number; completed: number }) =>
  row.lessons > 0 && row.completed === row.lessons;

interface ModuleItemProps {
  row: Row;
  studentId: string;
}

function ModuleItem({ row, studentId }: ModuleItemProps) {
  const percent = row.lessons ? (row.completed / row.lessons) * 100 : 0;
  return (
    <li className="grid gap-2 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
        <div className="grid min-w-0 gap-0.5">
          <Link
            to="/modules/$moduleId"
            params={{ moduleId: row.id }}
            search={studentId ? { studentId } : {}}
            className={cn(
              "justify-self-start text-sm leading-5 font-medium hover:text-primary hover:underline",
              phoneLink,
            )}
          >
            <bdi>{row.title}</bdi>
          </Link>
          {row.summary ? (
            <p
              dir="auto"
              className="text-[13px] leading-[18px] text-muted-foreground"
            >
              {row.summary}
            </p>
          ) : null}
        </div>
        {row.locked ? (
          <StatusText tone="neutral">{lockedText(row)}</StatusText>
        ) : finished(row) ? (
          <StatusText tone="success">{m.lrnFinished()}</StatusText>
        ) : null}
      </div>
      <Progress
        value={percent}
        aria-label={m.lrnProgressOf({ title: row.title })}
        getAriaValueText={() =>
          m.lrnDoneOf({
            count: formatNumber(row.completed),
            total: formatNumber(row.lessons),
          })
        }
        className="max-w-md gap-1"
      >
        <span className="text-[13px] leading-[18px] text-muted-foreground tabular-nums">
          {m.lrnDoneOf({
            count: formatNumber(row.completed),
            total: formatNumber(row.lessons),
          })}
        </span>
      </Progress>
    </li>
  );
}

export interface StudentModuleListProps {
  studentId: string;
}

/** A student's modules, the unfinished ones first, each with how far along it is. */
export function StudentModuleList({ studentId }: StudentModuleListProps) {
  const { rows } = useSuspenseQuery(myModulesQuery(studentId)).data;
  const going = rows.filter((row) => !finished(row));
  const done = rows.filter(finished);
  return (
    <div className="grid gap-6">
      <RecordSection title={m.lrnToFinish()}>
        {going.length === 0 ? (
          <RecordEmpty>{m.lrnNothingToFinish()}</RecordEmpty>
        ) : (
          <RecordList>
            {going.map((row) => (
              <ModuleItem key={row.id} row={row} studentId={studentId} />
            ))}
          </RecordList>
        )}
      </RecordSection>
      {done.length > 0 ? (
        <RecordSection title={m.lrnFinishedModules()}>
          <RecordList>
            {done.map((row) => (
              <ModuleItem key={row.id} row={row} studentId={studentId} />
            ))}
          </RecordList>
        </RecordSection>
      ) : null}
    </div>
  );
}

const STATE_ICON = { done: CircleCheck, open: Play, locked: Lock } as const;

export interface ModuleOutlineProps {
  moduleId: string;
  studentId: string;
}

/** A module as its student meets it: which lessons are done, which open, which wait. */
export function ModuleOutline({ moduleId, studentId }: ModuleOutlineProps) {
  const data = useSuspenseQuery(moduleOutlineQuery(moduleId, studentId)).data;
  const navigate = useNavigate();
  const done = data.lessons.filter((lesson) => lesson.state === "done").length;
  const next = data.lessons.find((lesson) => lesson.state === "open");
  const facts: HeaderFact[] = [
    {
      label: m.lrnProgress(),
      value: m.lrnDoneOf({
        count: formatNumber(done),
        total: formatNumber(data.lessons.length),
      }),
    },
    {
      label: m.lrnAuthor(),
      value: inLocale(data.authorNameEn, data.authorNameAr),
    },
  ];
  return (
    <div className="mx-auto w-full max-w-6xl">
      <RecordHeader
        title={data.title}
        facts={facts}
        status={
          data.locked
            ? { label: m.lrnLessonLocked(), tone: "neutral" }
            : done === data.lessons.length && done > 0
              ? { label: m.lrnFinished(), tone: "success" }
              : undefined
        }
        action={
          data.own && next
            ? {
                label: done === 0 ? m.lrnStart() : m.lrnContinue(),
                icon: Play,
                onClick: () =>
                  void navigate({
                    to: "/lessons/$lessonId",
                    params: { lessonId: next.id },
                    search: {},
                  }),
              }
            : undefined
        }
      />
      <RecordColumns
        main={
          <RecordSection
            title={m.lrnLessons()}
            description={
              data.locked
                ? lockedText(data)
                : data.sequential
                  ? m.lrnInOrderHint()
                  : undefined
            }
          >
            <ol className="-my-3 divide-y">
              {data.lessons.map((lesson, index) => {
                const Icon = STATE_ICON[lesson.state];
                const linked = data.own && lesson.state !== "locked";
                return (
                  <li
                    key={lesson.id}
                    className="flex items-center justify-between gap-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded-full border text-sm tabular-nums",
                          lesson.state === "done" &&
                            "border-success/30 bg-success/12 text-success",
                        )}
                      >
                        {lesson.state === "done" ? (
                          <CircleCheck className="size-4" />
                        ) : (
                          formatNumber(index + 1)
                        )}
                      </span>
                      {linked ? (
                        <Link
                          to="/lessons/$lessonId"
                          params={{ lessonId: lesson.id }}
                          search={{}}
                          className={cn(
                            "min-w-0 text-sm leading-5 font-medium hover:text-primary hover:underline",
                            phoneLink,
                          )}
                        >
                          <bdi>{lesson.title}</bdi>
                        </Link>
                      ) : (
                        <bdi
                          className={cn(
                            "min-w-0 text-sm leading-5 font-medium",
                            lesson.state === "locked" &&
                              "text-muted-foreground",
                          )}
                        >
                          {lesson.title}
                        </bdi>
                      )}
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] leading-[18px] text-muted-foreground">
                      <Icon aria-hidden className="size-3.5" />
                      {LESSON_STATE_LABEL[lesson.state]()}
                    </span>
                  </li>
                );
              })}
            </ol>
          </RecordSection>
        }
        aside={
          <>
            {data.own && !data.locked && done >= 2 ? (
              <RecordSection
                title={m.lrnPracticeTitle()}
                description={m.lrnPracticeEntryHint()}
              >
                <ButtonLink
                  to="/practice/$moduleId"
                  params={{ moduleId }}
                  variant="outline"
                  className="w-fit max-md:h-10"
                >
                  <Shuffle aria-hidden />
                  {m.lrnPracticeStart()}
                </ButtonLink>
              </RecordSection>
            ) : null}
            {data.summary ? (
              <RecordSection title={m.lrnAbout()}>
                <p dir="auto" className="text-sm leading-6">
                  {data.summary}
                </p>
              </RecordSection>
            ) : null}
            <ModuleGlossary moduleId={moduleId} studentId={studentId} />
          </>
        }
      />
    </div>
  );
}
