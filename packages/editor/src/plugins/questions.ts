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
  setStarterLabel,
  StarterNode,
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
 * dropped; where no student gets a copy, a part set aside for one stays as
 * plain text.
 */
export function QuestionGuardPlugin() {
  const [editor] = useLexicalComposerContext();
  const {
    strings,
    questions,
    gates = questions,
    lockQuestions,
    starter,
  } = useEditorEnvironment();
  useEffect(
    () => setStarterLabel(editor, strings.studentCopy),
    [editor, strings],
  );
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
        starter
          ? () => {}
          : editor.registerNodeTransform(StarterNode, (node) => {
              for (const child of node.getChildren()) node.insertBefore(child);
              node.remove();
            }),
      ),
    [editor, questions, gates, starter],
  );
  return null;
}
