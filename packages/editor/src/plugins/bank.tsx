import type { ContentDocument } from "@faridalms/domain/content";
import type { NodeKey } from "lexical";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $dfs } from "@lexical/utils";
import {
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $isParagraphNode,
  $parseSerializedNode,
  COMMAND_PRIORITY_LOW,
  createCommand,
} from "lexical";
import { useEffect } from "react";

import type { QuestionNode } from "../nodes/question";

import { $anchorFor } from "../blocks";
import { useEditorEnvironment } from "../context";
import {
  $isQuestionAnswerNode,
  $isQuestionGapNode,
  $isQuestionGroupNode,
  $isQuestionNode,
  $isQuestionOptionNode,
  $isQuestionPairNode,
  $isQuestionPromptNode,
} from "../nodes/question";
import { updateFromOutside } from "../outside";

export const OPEN_BANK_COMMAND = createCommand<void>("FARIDA_OPEN_BANK");

/**
 * A question from the bank as a block of this document: every id made new,
 * so it is a question of its own here, answered apart from wherever else it
 * is asked.
 */
export function $questionFromBank(
  content: ContentDocument,
): QuestionNode | null {
  const [stored] = content.root.children ?? [];
  if (stored?.type !== "question") return null;
  const node = $parseSerializedNode(stored);
  if (!$isQuestionNode(node)) return null;
  node.setSettings({ questionId: crypto.randomUUID() });
  for (const { node: part } of $dfs(node))
    if (
      $isQuestionOptionNode(part) ||
      $isQuestionAnswerNode(part) ||
      $isQuestionPairNode(part) ||
      $isQuestionGroupNode(part) ||
      $isQuestionGapNode(part)
    )
      part.setOptionId(crypto.randomUUID());
  return node;
}

/** Inserts a question chosen from the bank where the slash menu was opened. */
export function BankPlugin() {
  const [editor] = useLexicalComposerContext();
  const { bank } = useEditorEnvironment();
  useEffect(
    () =>
      editor.registerCommand(
        OPEN_BANK_COMMAND,
        () => {
          if (!bank) return false;
          const anchor: NodeKey | null =
            $anchorFor("choiceQuestion")?.getKey() ?? null;
          void bank.choose().then((content) => {
            if (!content) return;
            updateFromOutside(editor, () => {
              const question = $questionFromBank(content);
              if (!question) return;
              const at = anchor ? $getNodeByKey(anchor) : null;
              if (!at?.isAttached()) $getRoot().append(question);
              else if ($isParagraphNode(at) && at.getTextContentSize() === 0)
                at.replace(question);
              else at.insertAfter(question);
              if (!question.getNextSibling())
                question.insertAfter($createParagraphNode());
              const prompt = question.getFirstChild();
              if ($isQuestionPromptNode(prompt)) prompt.selectEnd();
            });
          });
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor, bank],
  );
  return null;
}
