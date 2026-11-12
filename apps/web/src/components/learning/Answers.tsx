import { useQuery, useQueryClient } from "@tanstack/react-query";

import { AnswerBoard } from "~/components/questions/AnswerBoard";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { writtenAnswersQuery } from "~/queries/learning";
import { markAnswer } from "~/server/learning";

import { answerGoals } from "./slots";

export interface AnswersProps {
  moduleId: string;
  classId: string;
}

/** The answers of one class a teacher marks, words or coding projects, question by question. */
export function Answers({ moduleId, classId }: AnswersProps) {
  const query = useQuery(writtenAnswersQuery(moduleId, classId));
  const queryClient = useQueryClient();
  const Goals = useSlot(answerGoals)[0];
  if (!query.data) return <div aria-busy="true" className="min-h-40" />;
  const goals = query.data.goals;
  return (
    <AnswerBoard
      students={query.data.students}
      questions={query.data.questions}
      answers={query.data.answers}
      renderNote={
        Goals && goals
          ? (question, answer, name) => (
              <Goals
                moduleId={moduleId}
                classId={classId}
                goals={goals}
                question={question}
                answer={answer}
                name={name}
              />
            )
          : undefined
      }
      empty={{ title: m.lrnNoWritten(), description: m.lrnNoWrittenBody() }}
      mark={async (question, answers, points, feedback, fluency) => {
        await markAnswer({
          data: {
            lessonId: question.lessonId,
            blockId: question.blockId,
            studentIds: answers.map((answer) => answer.studentId),
            points,
            feedback,
            ...(fluency ? { fluency } : {}),
          },
        });
        await queryClient.invalidateQueries({ queryKey: ["learning"] });
      }}
    />
  );
}
