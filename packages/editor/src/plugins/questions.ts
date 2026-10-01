import type { LexicalNode } from "lexical";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import { $createParagraphNode, $isElementNode } from "lexical";
import { useEffect } from "react";

import { useEditorEnvironment } from "../context";
import {
  $isQuestionAnswerNode,
  $isQuestionGapNode,
  $isQuestionGroupNode,
  $isQuestionPairNode,
  GateNode,
  QuestionNode,
  setQuestionsLocked,
} from "../nodes";

/** Each line of a question's words, without its answers. */
function $linesOf(node: LexicalNode): LexicalNode[] {
  if (!$isElementNode(node) || $isQuestionAnswerNode(node)) return [];
  if ($isQuestionPairNode(node) || $isQuestionGroupNode(node))
    return node.getChildren().flatMap($linesOf);
  const words = node
    .getChildren()
    .filter((child) => !$isQuestionGapNode(child));
  return [$createParagraphNode().append(...words)];
}

/**
 * Where a document asks no questions, such as an announcement, a question
 * pasted in keeps its words as paragraphs and drops its key, and a gate is
 * dropped.
 */
export function QuestionGuardPlugin() {
  const [editor] = useLexicalComposerContext();
  const {
    questions,
    gates = questions,
    lockQuestions,
  } = useEditorEnvironment();
  useEffect(
    () => setQuestionsLocked(editor, Boolean(lockQuestions)),
    [editor, lockQuestions],
  );
  useEffect(
    () =>
      mergeRegister(
        questions
          ? () => {}
          : editor.registerNodeTransform(QuestionNode, (question) => {
              for (const line of question.getChildren().flatMap($linesOf))
                question.insertBefore(line);
              question.remove();
            }),
        gates
          ? () => {}
          : editor.registerNodeTransform(GateNode, (gate) => gate.remove()),
      ),
    [editor, questions, gates],
  );
  return null;
}
