import type { CheckStanding } from "@faridalms/domain/learning";

import { useQuery } from "@tanstack/react-query";
import {
  CircleCheck,
  CircleDashed,
  HandHelping,
  ListChecks,
} from "lucide-react";

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
type Lesson = Data["lessons"][number];
type Question = Lesson["questions"][number];

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

type YoungStanding = "first" | "helped" | "notYet";

// The help ladder's three outcomes: right at once, right once a hint or the
// shown answer helped, and not there yet, which a young child is never told.
const YOUNG_OF: Record<CheckStanding, YoungStanding> = {
  first: "first",
  later: "helped",
  shown: "helped",
  trying: "notYet",
  unseen: "notYet",
};

const YOUNG_MARK: Record<
  YoungStanding,
  { icon: typeof CircleCheck; label: () => string; className: string }
> = {
  first: {
    icon: CircleCheck,
    label: m.lrnYoungFirstTry,
    className: "text-success",
  },
  helped: {
    icon: HandHelping,
    label: m.lrnYoungWithHelp,
    className: "text-info",
  },
  notYet: {
    icon: CircleDashed,
    label: m.lrnYoungNotYet,
    className: "text-muted-foreground",
  },
};

/**
 * A young lesson read child by child: each question shows whether the child
 * got it on the first try, with help, or not yet. Screen practice informs
 * what the teacher sees in class; it is no judgement of development.
 */
function YoungGrid({
  lesson,
  names,
}: {
  lesson: Lesson;
  names: Map<string, string>;
}) {
  return (
    <div className="grid gap-3">
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] leading-[18px] text-muted-foreground">
        {(["first", "helped", "notYet"] as const).map((standing) => {
          const mark = YOUNG_MARK[standing];
          return (
            <li key={standing} className="flex items-center gap-1.5">
              <mark.icon aria-hidden className={`size-4 ${mark.className}`} />
              {mark.label()}
            </li>
          );
        })}
      </ul>
      <div className="w-fit max-w-full overflow-x-auto rounded-lg border">
        <table className="min-w-max text-sm">
          <caption className="sr-only">
            {m.lrnYoungGridCaption({ lesson: lesson.title })}
          </caption>
          <thead className="border-b bg-muted/40 text-[13px] text-muted-foreground">
            <tr>
              <th
                scope="col"
                className="sticky start-0 bg-muted/40 px-3 py-2 text-start font-medium"
              >
                {m.courseworkStudent()}
              </th>
              {lesson.questions.map((question, index) => (
                <th
                  key={question.id}
                  scope="col"
                  title={question.prompt}
                  className="min-w-12 px-3 py-2 text-center font-medium tabular-nums"
                >
                  <span aria-hidden>{formatNumber(index + 1)}</span>
                  <span className="sr-only">{question.prompt}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {[...names].map(([id, name]) => (
              <tr key={id}>
                <th
                  scope="row"
                  className="sticky start-0 bg-background px-3 py-2 text-start font-medium"
                >
                  <bdi>{name}</bdi>
                </th>
                {lesson.questions.map((question) => {
                  const standing = question.standings[id];
                  const mark =
                    YOUNG_MARK[standing ? YOUNG_OF[standing] : "notYet"];
                  return (
                    <td key={question.id} className="px-3 py-2 text-center">
                      <mark.icon
                        aria-hidden
                        className={`inline size-5 ${mark.className}`}
                      />
                      <span className="sr-only">{mark.label()}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {m.lrnYoungGridNote()}
      </p>
    </div>
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
          {lesson.young ? (
            <YoungGrid lesson={lesson} names={names} />
          ) : (
            lesson.questions.map((question) => (
              <QuestionCard
                key={question.id}
                question={question}
                names={names}
              />
            ))
          )}
        </section>
      ))}
    </div>
  );
}
