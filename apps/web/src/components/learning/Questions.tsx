import type { CheckStanding } from "@faridalms/domain/learning";

import { useQuery } from "@tanstack/react-query";
import { CircleCheck, ListChecks } from "lucide-react";

import type { Tone } from "~/components/system/status";

import { displayName } from "~/components/people/format";
import { EmptyState } from "~/components/system/IndexPage";
import { StatusBadge } from "~/components/system/status";
import * as m from "~/i18n/messages";
import { classQuestionsQuery } from "~/queries/learning";
import { formatList, formatNumber } from "~/utils/datetime";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof classQuestionsQuery>["queryFn"]>>
>;
type Question = Data["lessons"][number]["questions"][number];

const STANDINGS: readonly CheckStanding[] = [
  "first",
  "later",
  "shown",
  "trying",
  "unseen",
];

const STANDING_LABEL: Record<CheckStanding, () => string> = {
  first: m.lrnStandingFirst,
  later: m.lrnStandingLater,
  shown: m.lrnStandingShown,
  trying: m.lrnStandingTrying,
  unseen: m.lrnStandingUnseen,
};

const STANDING_TONE: Record<CheckStanding, Tone> = {
  first: "success",
  later: "info",
  shown: "warning",
  trying: "accent",
  unseen: "neutral",
};

function QuestionCard({
  question,
  names,
}: {
  question: Question;
  names: Map<string, string>;
}) {
  const students = [...names.keys()];
  const standing = (wanted: CheckStanding) =>
    students.filter((id) => question.standings[id] === wanted);
  const chosen = (optionId: string) =>
    students.filter((id) => question.firstChoices[id]?.includes(optionId));
  const answered = students.filter((id) => question.firstChoices[id]).length;
  return (
    <article className="grid gap-4 rounded-lg border p-4">
      <h3 dir="auto" className="text-sm leading-5 font-medium">
        {question.prompt}
      </h3>
      <ul className="flex flex-wrap gap-2">
        {STANDINGS.map((wanted) => {
          const count = standing(wanted).length;
          return count === 0 ? null : (
            <li key={wanted}>
              <StatusBadge tone={STANDING_TONE[wanted]}>
                {STANDING_LABEL[wanted]()} · {formatNumber(count)}
              </StatusBadge>
            </li>
          );
        })}
      </ul>
      {question.options ? (
        <div className="grid gap-3">
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {m.lrnFirstChoices()}
          </p>
          <ul className="grid gap-3">
            {question.options.map((option) => {
              const who = chosen(option.id);
              const share = answered ? (who.length / answered) * 100 : 0;
              return (
                <li key={option.id} className="grid gap-1.5">
                  <div className="flex items-center gap-2 text-sm leading-5">
                    <span dir="auto" className="min-w-0 flex-1">
                      {option.text}
                    </span>
                    {option.correct ? (
                      <>
                        <CircleCheck
                          aria-hidden
                          className="size-4 shrink-0 text-success"
                        />
                        <span className="sr-only">{m.lrnRightOption()}</span>
                      </>
                    ) : null}
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {formatNumber(who.length)}
                    </span>
                  </div>
                  <div aria-hidden className="h-1.5 rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${option.correct ? "bg-success" : "bg-warning"}`}
                      style={{ width: `${share}%` }}
                    />
                  </div>
                  {who.length > 0 ? (
                    <p className="text-[13px] leading-[18px] text-muted-foreground">
                      {formatList(who.map((id) => names.get(id) ?? ""))}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        (["shown", "trying"] as const).map((wanted) => {
          const who = standing(wanted);
          return who.length === 0 ? null : (
            <p
              key={wanted}
              className="text-[13px] leading-[18px] text-muted-foreground"
            >
              {STANDING_LABEL[wanted]()}:{" "}
              {formatList(who.map((id) => names.get(id) ?? ""))}
            </p>
          );
        })
      )}
    </article>
  );
}

/**
 * How a class did on each question, from every student's first attempt:
 * where each stands, and for a choice who first picked which option, so a
 * common wrong idea shows. Only the teacher sees it.
 */
export function ClassQuestions({
  moduleId,
  classId,
}: {
  moduleId: string;
  classId: string;
}) {
  const query = useQuery(classQuestionsQuery(moduleId, classId));
  if (!query.data) return <div aria-busy="true" className="min-h-40" />;
  const { students, lessons } = query.data;
  if (lessons.length === 0)
    return (
      <EmptyState
        icon={ListChecks}
        title={m.lrnNoQuestions()}
        description={m.lrnNoQuestionsBody()}
      />
    );
  const names = new Map(students.map((row) => [row.id, displayName(row)]));
  return (
    <div className="grid max-w-3xl gap-8">
      {lessons.map((lesson) => (
        <section
          key={lesson.id}
          aria-labelledby={`questions-${lesson.id}`}
          className="grid gap-3"
        >
          <h2
            id={`questions-${lesson.id}`}
            className="text-base leading-6 font-semibold"
          >
            <bdi>{lesson.title}</bdi>
          </h2>
          {lesson.questions.map((question) => (
            <QuestionCard key={question.id} question={question} names={names} />
          ))}
        </section>
      ))}
    </div>
  );
}
