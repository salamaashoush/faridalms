import { useQuery, useQueryClient } from "@tanstack/react-query";

import { AnswerBoard } from "~/components/learning/Answers";
import * as m from "~/i18n/messages";
import { quizAnswersQuery } from "~/queries/coursework";
import { markQuizAnswer } from "~/server/coursework";

export interface QuizAnswersProps {
  assignmentId: string;
}

/** A quiz's answers its teacher judges, question by question across the class. */
export function QuizAnswers({ assignmentId }: QuizAnswersProps) {
  const query = useQuery(quizAnswersQuery(assignmentId));
  const queryClient = useQueryClient();
  if (!query.data) return <div aria-busy="true" className="min-h-40" />;
  const { students, questions, answers } = query.data;
  return (
    <AnswerBoard
      students={students}
      questions={questions.map((question) => ({
        ...question,
        lessonId: assignmentId,
        lessonTitle: "",
        gallery: false,
        checks: [],
        standards: [],
        passage: null,
      }))}
      answers={answers.map((answer) => ({
        ...answer,
        lessonId: assignmentId,
        try: answer.attempt,
        thumbnail: null,
        remixOf: null,
        has: null,
        notes: null,
        share: null,
        offered: null,
        fluency: null,
      }))}
      empty={{
        title: m.quizNothingToMark(),
        description: m.quizNothingToMarkBody(),
      }}
      mark={async (question, chosen, points, feedback) => {
        await markQuizAnswer({
          data: {
            attemptIds: chosen.flatMap((answer) =>
              answer.attemptId ? [answer.attemptId] : [],
            ),
            blockId: question.blockId,
            points,
            feedback,
          },
        });
        await queryClient.invalidateQueries({ queryKey: ["coursework"] });
      }}
    />
  );
}
