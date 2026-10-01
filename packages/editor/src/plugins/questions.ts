import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createParagraphNode, $isElementNode } from "lexical";
import { useEffect } from "react";

import { useEditorEnvironment } from "../context";
import { QuestionNode } from "../nodes";

/**
 * Where a document asks no questions, such as an announcement, a question
 * pasted in keeps its words as paragraphs and drops its key.
 */
export function QuestionGuardPlugin() {
  const [editor] = useLexicalComposerContext();
  const { questions } = useEditorEnvironment();
  useEffect(() => {
    if (questions) return undefined;
    return editor.registerNodeTransform(QuestionNode, (question) => {
      const paragraphs = question.getChildren().flatMap((child) => {
        if (!$isElementNode(child)) return [];
        if (child.getType() === "question-answer") return [];
        return [$createParagraphNode().append(...child.getChildren())];
      });
      for (const paragraph of paragraphs) question.insertBefore(paragraph);
      question.remove();
    });
  }, [editor, questions]);
  return null;
}
