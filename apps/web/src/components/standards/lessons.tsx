import type { GoalLevel } from "@faridalms/domain/standards";

import { Segmented } from "@faridalms/ui/system/panel";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { AnswerGoalsProps } from "~/components/learning/slots";
import type { ModuleFillings } from "~/utils/extension";

import { answerGoals, planCoverage } from "~/components/learning/slots";
import * as m from "~/i18n/messages";
import { writtenAnswersQuery } from "~/queries/learning";
import { judgeGoal } from "~/server/standards";
import { getMessageFromError } from "~/utils/error";
import { fill } from "~/utils/extension";
import { modulePages } from "~/utils/pages";

import { GOAL_LEVEL, GoalMark, goalName } from "./Goals";
import { PLAN_COVERAGE } from "./PlanCoverage";

const LEVEL_CHOICES = ["none", "emerging", "expected"] as const;
type LevelChoice = (typeof LEVEL_CHOICES)[number];

interface GoalJudgeProps {
  goal: { id: string; code: string; statement: string };
  level: GoalLevel | null;
  name: string;
  onJudge: (level: GoalLevel | null) => Promise<unknown>;
}

function GoalJudge({ goal, level, name, onJudge }: GoalJudgeProps) {
  const save = useMutation({
    mutationFn: onJudge,
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const shown = save.isPending ? save.variables : level;
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
      <span dir="auto" className="min-w-0 flex-1 basis-48 text-sm leading-5">
        {goalName(goal)}
      </span>
      {shown === "exempt" ? (
        // An exemption is recorded on the class's Goals tab, never from an answer.
        <GoalMark level={shown} />
      ) : (
        <Segmented<LevelChoice>
          label={m.goalsLevelOn({ name, goal: goal.statement })}
          value={shown ?? "none"}
          options={LEVEL_CHOICES.map((value) => ({
            value,
            label:
              value === "none" ? m.goalsNotJudged() : GOAL_LEVEL[value].label(),
          }))}
          onChange={(picked) => save.mutate(picked === "none" ? null : picked)}
          className="w-full flex-nowrap sm:w-80"
        />
      )}
    </li>
  );
}

/**
 * Where the child stands against the goals the question is tagged with,
 * judged by a young class's teacher from what the child answered.
 */
function AnswerGoals({
  moduleId,
  classId,
  goals,
  question,
  answer,
  name,
}: AnswerGoalsProps) {
  const queryClient = useQueryClient();
  const tagged = goals.standards.filter((goal) =>
    question.standards.includes(goal.id),
  );
  if (tagged.length === 0) return null;
  const levelOf = (standardId: string) =>
    goals.judgements.find(
      (row) =>
        row.studentId === answer.studentId && row.standardId === standardId,
    )?.level ?? null;
  const judge = async (standardId: string, level: GoalLevel | null) => {
    await judgeGoal({
      data: {
        classId,
        studentId: answer.studentId,
        standardId,
        level,
        from: { lessonId: question.lessonId, blockId: question.blockId },
      },
    });
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: writtenAnswersQuery(moduleId, classId).queryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: ["standards", "goals", classId],
      }),
    ]);
  };
  return (
    <div className="grid gap-2 border-t pt-3">
      <div className="grid gap-0.5">
        <p className="text-sm leading-5 font-medium">{m.goalsFromAnswer()}</p>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.goalsFromAnswerHint()}
        </p>
      </div>
      <ul className="grid gap-2">
        {tagged.map((goal) => (
          <GoalJudge
            key={goal.id}
            goal={goal}
            level={levelOf(goal.id)}
            name={name}
            onJudge={(level) => judge(goal.id, level)}
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * The curriculum map reads the unit plans e-learning keeps, a unit plan is
 * read against the standards it names, and a lesson's answers are where a
 * young class's goals are judged.
 */
export const STANDARDS_IN_LESSONS: ModuleFillings = {
  module: "standards",
  needs: ["elearning"],
  fillings: [
    fill(modulePages, ["/standards/map"]),
    fill(answerGoals, AnswerGoals),
    fill(planCoverage, PLAN_COVERAGE),
  ],
};
