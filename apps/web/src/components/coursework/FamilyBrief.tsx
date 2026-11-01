import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@faridalms/ui/sheet";
import { useQuery } from "@tanstack/react-query";

import { classTitle } from "~/components/classes/format";
import { ContentView } from "~/components/content/ContentView";
import { RecordEmpty } from "~/components/system/RecordPage";
import * as m from "~/i18n/messages";
import { getLocale, getTextDirection } from "~/i18n/runtime";
import { childBriefQuery } from "~/queries/coursework";
import { formatInstant, formatNumber } from "~/utils/datetime";

import { resultText } from "../grading/format";
import { useBriefLanguage } from "./BriefLanguage";

const fileUrl = (fileId: string) => `/files/${fileId}`;

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof childBriefQuery>["queryFn"]>>
>;

function Read({ data }: { data: Data }) {
  const reading = useBriefLanguage({
    title: data.assignment.title,
    brief: data.brief,
    language: data.assignment.language,
    translation: data.translation,
  });
  const facts = [
    data.assignment.class ? classTitle(data.assignment.class) : null,
    data.assignment.dueAt
      ? m.courseworkDueOn({
          date: formatInstant(data.assignment.dueAt),
        })
      : null,
  ].filter(Boolean);
  return (
    <>
      <SheetHeader className="gap-1 border-b px-5 py-3.5 pe-14">
        <SheetTitle className="text-base leading-6 font-semibold">
          <bdi>{reading.title}</bdi>
        </SheetTitle>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {facts.join(" · ")}
        </p>
      </SheetHeader>
      <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-5 py-5">
        {data.result ? <Result data={data} result={data.result} /> : null}
        {reading.switcher}
        {reading.brief ? (
          <div lang={reading.lang} dir={reading.dir}>
            <ContentView document={reading.brief} fileUrl={fileUrl} />
          </div>
        ) : (
          <RecordEmpty>{m.courseworkNoBrief()}</RecordEmpty>
        )}
      </div>
    </>
  );
}

function Result({
  data,
  result,
}: {
  data: Data;
  result: NonNullable<Data["result"]>;
}) {
  const criteria = data.assignment.rubric?.criteria ?? [];
  const scored =
    result.score !== null || result.grade
      ? resultText(
          result.grade,
          result.score,
          data.assignment.points,
          "learner",
        )
      : "";
  return (
    <section
      aria-labelledby="family-result"
      className="grid gap-2 rounded-lg bg-muted/50 p-3"
    >
      <h3 id="family-result" className="text-sm leading-5 font-semibold">
        {m.courseworkFamilyResult()}
      </h3>
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {m.courseworkReturnedOn({ date: formatInstant(result.releasedAt) })}
      </p>
      {scored ? (
        <p className="text-sm leading-5 font-medium tabular-nums">{scored}</p>
      ) : null}
      {result.rubricScores && criteria.length ? (
        <ul className="grid gap-1 text-sm leading-5">
          {criteria.map((criterion) => {
            const level = criterion.levels.find(
              (row) => row.id === result.rubricScores?.[criterion.id],
            );
            const comment = result.rubricComments?.[criterion.id];
            return (
              <li key={criterion.id} className="grid gap-0.5">
                <div className="flex flex-wrap justify-between gap-x-4">
                  <span dir="auto">{criterion.title}</span>
                  <span className="text-muted-foreground" dir="auto">
                    {level
                      ? m.courseworkRubricLevel({
                          level: level.title,
                          points: formatNumber(level.points),
                        })
                      : m.commonNotRecorded()}
                  </span>
                </div>
                {comment ? (
                  <p
                    dir="auto"
                    className="whitespace-pre-wrap text-muted-foreground"
                  >
                    {comment}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {result.feedback ? (
        <div className="grid gap-0.5">
          <h4 className="text-[13px] leading-[18px] font-medium text-muted-foreground">
            {m.courseworkFeedback()}
          </h4>
          <p dir="auto" className="text-sm leading-5 whitespace-pre-wrap">
            {result.feedback}
          </p>
        </div>
      ) : null}
    </section>
  );
}

/** A piece of a child's work as their family reads it, in either language of its brief. */
export function FamilyBrief({
  studentId,
  assignmentId,
  title,
  onClose,
}: {
  studentId: string;
  assignmentId: string;
  /** Its title as the list gave it, while the brief is on its way. */
  title: string;
  onClose: () => void;
}) {
  const brief = useQuery(childBriefQuery(studentId, assignmentId));
  const end = getTextDirection(getLocale()) === "rtl" ? "left" : "right";
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side={end}
        className="gap-0 p-0 data-[side=left]:w-full data-[side=right]:w-full data-[side=left]:sm:max-w-[640px] data-[side=right]:sm:max-w-[640px]"
      >
        {brief.data ? (
          <Read data={brief.data} />
        ) : (
          <SheetHeader className="border-b px-5 py-3.5 pe-14" aria-busy="true">
            <SheetTitle className="text-base leading-6 font-semibold">
              <bdi>{title}</bdi>
            </SheetTitle>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
}
