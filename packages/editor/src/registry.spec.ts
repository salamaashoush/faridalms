import {
  contentDocumentSchema,
  contentNodeTypes,
} from "@faridalms/domain/content";
import { $createTableNodeWithDimensions } from "@lexical/table";
import {
  $createParagraphNode,
  $getRoot,
  $isElementNode,
  getRegisteredNode,
} from "lexical";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { $insertBlock, blockDefinitions } from "./blocks";
import { buildContentEditor } from "./headless";
import { $createCalloutNode, blockNodes } from "./nodes";

describe("node registry", () => {
  it("has an editor node for every type a document may hold", () => {
    const editor = buildContentEditor();
    expect(
      contentNodeTypes.filter((type) => !getRegisteredNode(editor, type)),
    ).toEqual([]);
  });

  it("accepts every block node the editor can write", () => {
    expect(
      blockNodes
        .map((node) => node.getType())
        .filter(
          (type) => !(contentNodeTypes as readonly string[]).includes(type),
        ),
    ).toEqual([]);
  });
});

describe("block placement", () => {
  const places = {
    "the top": () => {
      const line = $createParagraphNode();
      $getRoot().append(line);
      return line;
    },
    "a callout": () => {
      const line = $createParagraphNode();
      $getRoot().append($createCalloutNode("info").append(line));
      return line;
    },
    "a table cell": () => {
      const table = $createTableNodeWithDimensions(1, 1, false);
      $getRoot().append(table);
      const cell = table.getFirstDescendant()?.getParent();
      if (!$isElementNode(cell)) throw new Error("no cell");
      return cell;
    },
  };

  // An outside tool's link takes the school's first tool when it is drawn,
  // which an editor without a screen never does.
  const drawnFirst = new Set(["outsideTool"]);

  for (const block of blockDefinitions.filter(
    (definition) => !drawnFirst.has(definition.type),
  ))
    for (const [place, $make] of Object.entries(places))
      it(`saves ${block.type} inserted in ${place}`, () => {
        const editor = buildContentEditor();
        editor.update(
          () => {
            $getRoot().clear();
            const line = $make();
            line.selectStart();
            $insertBlock(block.type);
          },
          { discrete: true },
        );
        const saved = v.safeParse(
          contentDocumentSchema,
          editor.getEditorState().toJSON(),
        );
        expect(saved.issues?.map((issue) => issue.message)).toBeUndefined();
      });
});
