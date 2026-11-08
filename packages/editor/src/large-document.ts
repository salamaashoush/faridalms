import type { ContentDocument } from "@faridalms/domain/content";
import type { LexicalNode } from "lexical";

import { contentDocumentSchema } from "@faridalms/domain/content";
import { $createCodeNode } from "@lexical/code";
import { $createListItemNode, $createListNode } from "@lexical/list";
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text";
import {
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  TableCellHeaderStates,
} from "@lexical/table";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
} from "lexical";
import * as v from "valibot";

import { buildContentEditor } from "./headless";
import {
  $createCalloutNode,
  $createFileNode,
  $createImageNode,
  $createMathNode,
  $createQuestionNode,
} from "./nodes";

const WORDS = (
  "the class reads a short passage about rivers and then writes what they " +
  "noticed in their own words before comparing notes with a partner who " +
  "read the same text while the teacher circulates asking each pair which " +
  "sentence surprised them most and why the author chose that word"
).split(" ");
const ARABIC = (
  "يقرأ الطلاب نصا قصيرا عن الأنهار ثم يكتبون ما لاحظوه بكلماتهم " +
  "قبل أن يقارنوا ملاحظاتهم مع زميل قرأ النص نفسه"
).split(" ");

function sentence(seed: number, length: number, words = WORDS) {
  return Array.from(
    { length },
    (_, index) => words[(seed * 7 + index * 3) % words.length],
  ).join(" ");
}

/** A paragraph with some of its words bold, italic or code, as writing has. */
function $paragraph(seed: number) {
  const paragraph = $createParagraphNode();
  paragraph.append(
    $createTextNode(`${sentence(seed, 24)} `),
    $createTextNode(sentence(seed + 1, 4)).toggleFormat("bold"),
    $createTextNode(` ${sentence(seed + 2, 18)} `),
    $createTextNode(sentence(seed + 3, 3)).toggleFormat("italic"),
    $createTextNode(` ${sentence(seed + 4, 12)}.`),
  );
  return paragraph;
}

function $table(rows: number, columns: number, seed: number) {
  const table = $createTableNode();
  for (let row = 0; row < rows; row += 1) {
    const line = $createTableRowNode();
    for (let column = 0; column < columns; column += 1) {
      const cell = $createTableCellNode(
        row === 0 ? TableCellHeaderStates.ROW : TableCellHeaderStates.NO_STATUS,
      );
      cell.append(
        $createParagraphNode().append(
          $createTextNode(sentence(seed + row * columns + column, 3)),
        ),
      );
      line.append(cell);
    }
    table.append(line);
  }
  return table;
}

function $choice(seed: number) {
  const question = $createQuestionNode("choice");
  const parts = question.getChildren();
  for (const [index, part] of parts.entries())
    if ($isElementNode(part))
      part.append(
        $createTextNode(
          index === 0 ? `${sentence(seed, 10)}?` : sentence(seed + index, 4),
        ),
      );
  return question;
}

export interface LargeDocumentOptions {
  /** How many times the mix of blocks repeats; each round is 24 blocks. */
  rounds?: number;
  /** A stored picture to show wherever the document has one. */
  pictureId?: string;
  /** A stored file to attach wherever the document has one. */
  fileId?: string;
}

/**
 * A long lesson as teachers write them: sections under headings, paragraphs
 * with formatting, lists, a table, pictures, a file, code, formulas, a
 * callout, a quote, Arabic passages and questions. It measures the editor at
 * the size where per-keystroke work starts to show.
 */
export function largeDocument({
  rounds = 14,
  pictureId = "00000000-0000-4000-8000-000000000001",
  fileId = "00000000-0000-4000-8000-000000000002",
}: LargeDocumentOptions = {}): ContentDocument {
  const editor = buildContentEditor();
  editor.update(
    () => {
      const root = $getRoot().clear();
      const blocks: LexicalNode[] = [];
      for (let round = 0; round < rounds; round += 1) {
        const seed = round * 31;
        blocks.push(
          $createHeadingNode("h2").append(
            $createTextNode(`Section ${round + 1}: ${sentence(seed, 4)}`),
          ),
          $paragraph(seed),
          $paragraph(seed + 1),
          $createImageNode(pictureId, sentence(seed, 6), "medium"),
          $paragraph(seed + 2),
          $createHeadingNode("h3").append(
            $createTextNode(sentence(seed + 3, 5)),
          ),
          $createListNode("bullet").append(
            ...Array.from({ length: 4 }, (_, index) =>
              $createListItemNode().append(
                $createTextNode(sentence(seed + index, 8)),
              ),
            ),
          ),
          $paragraph(seed + 4),
          $table(5, 4, seed),
          $createParagraphNode().append(
            $createTextNode(`${sentence(seed + 5, 10)} `),
            $createMathNode("\\frac{a}{b} + \\sqrt{x^2 + 1}"),
            $createTextNode(` ${sentence(seed + 6, 8)}.`),
          ),
          $createCodeNode("python").append(
            $createTextNode(
              `def area(width, height):\n    return width * height\n\nprint(area(${round}, 4))`,
            ),
          ),
          $paragraph(seed + 7),
          $createCalloutNode("info").append($paragraph(seed + 8)),
          $createParagraphNode().append(
            $createTextNode(sentence(seed + 9, 20, ARABIC)),
          ),
          $choice(seed),
          $paragraph(seed + 10),
          $createQuoteNode().append($createTextNode(sentence(seed + 11, 14))),
          $createListNode("number").append(
            ...Array.from({ length: 3 }, (_, index) =>
              $createListItemNode().append(
                $createTextNode(sentence(seed + index + 5, 9)),
              ),
            ),
          ),
          $paragraph(seed + 12),
          $createMathNode("E = mc^2", true),
          $paragraph(seed + 13),
          $createFileNode(
            fileId,
            `worksheet-${round + 1}.pdf`,
            "application/pdf",
            48_213,
          ),
          $paragraph(seed + 14),
          $paragraph(seed + 15),
        );
      }
      root.append(...blocks);
    },
    { discrete: true },
  );
  return v.parse(contentDocumentSchema, editor.getEditorState().toJSON());
}
