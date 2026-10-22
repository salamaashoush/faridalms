import type { CheckView } from "@faridalms/domain/learning";
import type { PracticeAnswer } from "@faridalms/domain/practice";

import { allWithoutVowelMarks } from "@faridalms/domain/arabic";
import { bandFor } from "@faridalms/domain/learning";
import { Button } from "@faridalms/ui/button";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Shuffle } from "lucide-react";
import { useMemo, useState } from "react";

import { ButtonLink } from "~/components/app/ButtonLink";
import { EmptyState } from "~/components/system/IndexPage";
import { RecordHeader } from "~/components/system/RecordPage";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { practiceSetQuery } from "~/queries/learning";
import { checkPractice } from "~/server/learning";
import { formatNumber } from "~/utils/datetime";

import type { CheckDriver } from "./Checks";

import { CheckBlockView, isCheckBlock, isSettled } from "./Checks";
import { YoungContext } from "./ReadAloud";
import { YoungLesson } from "./young/YoungLesson";

/**
 * A mixed review of a module: questions from finished lessons, the ones
 * missed the first time first, each marked by the API and kept nowhere, so
 * a review never touches a lesson's marks.
 */
export function PracticePlayer({
  moduleId,
  round,
  onRound,
}: {
  moduleId: string;
  round: number;
  onRound: (round: number) => void;
}) {
  const data = useSuspenseQuery(practiceSetQuery(moduleId, round)).data;
  const earlyYears = useCurrentUser().features.early_years;
  const navigate = useNavigate();
  const check = useServerFn(checkPractice);
  // A question's id in the review carries its lesson's, since two lessons
  // may share a question copied from one to the other. Nothing here scores,
  // so no question shows its points.
  const items = useMemo(
    () =>
      data.items.map((item) => {
        const block =
          item.vowelMarks === "hidden"
            ? allWithoutVowelMarks(item.block)
            : item.block;
        return {
          ...item,
          blockId: item.block.id,
          block: {
            ...block,
            id: `${item.lessonId}:${item.block.id}`,
            points: 0 as const,
          },
        };
      }),
    [data.items],
  );
  const [views, setViews] = useState<Record<string, CheckView>>(() =>
    Object.fromEntries(items.map((item) => [item.block.id, item.check])),
  );
  const send = async (key: string, answer: PracticeAnswer) => {
    const item = items.find((entry) => entry.block.id === key);
    if (!item) return;
    const view = await check({
      data: {
        lessonId: item.lessonId,
        blockId: item.blockId,
        before: views[key]?.tries ?? 0,
        hints: views[key]?.asked ?? 0,
        answer,
      },
    });
    setViews((current) => ({ ...current, [key]: view }));
  };
  const driver: CheckDriver = {
    respond: (key, response) => send(key, { kind: "response", response }),
    reveal: (key) => send(key, { kind: "reveal" }),
    hint: (key) =>
      send(key, { kind: "hint", last: views[key]?.response ?? null }),
  };
  const back = () =>
    void navigate({ to: "/modules/$moduleId", params: { moduleId } });

  if (!data.enough)
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <EmptyState
          icon={Shuffle}
          title={m.lrnPracticeTitle()}
          description={m.lrnPracticeNotYet()}
          action={
            <ButtonLink
              to="/modules/$moduleId"
              params={{ moduleId }}
              variant="outline"
            >
              {m.lrnPracticeBack()}
            </ButtonLink>
          }
        />
      </div>
    );

  const blocks = items.map((item) => item.block);
  if (data.young && earlyYears)
    return (
      <YoungContext.Provider value>
        <YoungLesson
          key={round}
          title={m.lrnPracticeYoungTitle()}
          blocks={blocks}
          checks={views}
          driver={driver}
          onClose={back}
          retry={{ pending: false, onRetry: () => onRound(round + 1) }}
          readAlong={data.readAlong}
          classSounds={data.sounds}
        />
      </YoungContext.Provider>
    );

  const questions = items.filter((item) => isCheckBlock(item.block));
  const settled = questions.every((item) =>
    isCheckBlock(item.block)
      ? isSettled(item.block, views[item.block.id])
      : true,
  );
  const firstTime = questions.filter((item) => {
    const view = views[item.block.id];
    return view?.correct && view.tries === 1 && view.asked === 0;
  }).length;
  const band = bandFor(
    data.bands,
    questions.length > 0
      ? Math.round((firstTime / questions.length) * 100)
      : null,
  );
  return (
    <article className="mx-auto grid w-full max-w-3xl gap-6">
      <div>
        <RecordHeader
          title={m.lrnPracticeTitle()}
          facts={[{ label: m.lrnSectionModule(), value: data.module.title }]}
        />
        <p className="text-sm leading-6 text-muted-foreground">
          {m.lrnPracticeIntro()}
        </p>
      </div>
      {items.map((item, index) =>
        isCheckBlock(item.block) ? (
          <section key={item.block.id} className="grid gap-2">
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              {m.lrnPracticeFrom({
                number: formatNumber(index + 1),
                lesson: item.lessonTitle,
              })}
            </p>
            <CheckBlockView
              block={item.block}
              view={views[item.block.id]}
              driver={driver}
            />
          </section>
        ) : null,
      )}
      <div aria-live="polite">
        {settled ? (
          <section className="grid justify-items-start gap-4 rounded-lg border bg-card p-5">
            <p className="text-base leading-6 font-semibold">
              {m.lrnPracticeDone({
                count: formatNumber(firstTime),
                total: formatNumber(questions.length),
              })}
            </p>
            {band ? (
              <p dir="auto" className="text-sm leading-5">
                {band.text}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => onRound(round + 1)}>
                <Shuffle aria-hidden />
                {m.lrnPracticeAgain()}
              </Button>
              <Button type="button" variant="outline" onClick={back}>
                {m.lrnPracticeBack()}
              </Button>
            </div>
          </section>
        ) : null}
      </div>
    </article>
  );
}
