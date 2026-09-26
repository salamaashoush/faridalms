import type { LexicalEditor } from "lexical";

import type { BlockType } from "../blocks";

import { $insertBlock } from "../blocks";
import { EDIT_DIAGRAM_COMMAND } from "../nodes";
import { OPEN_EMBED_COMMAND } from "./embed";
import { INSERT_MEDIA_COMMAND } from "./media";

export function $runBlock(editor: LexicalEditor, type: BlockType) {
  if (type === "image" || type === "file" || type === "media") {
    editor.dispatchCommand(INSERT_MEDIA_COMMAND, type);
    return;
  }
  if (type === "embed") {
    editor.dispatchCommand(OPEN_EMBED_COMMAND, undefined);
    return;
  }
  if (type === "diagram") {
    editor.dispatchCommand(EDIT_DIAGRAM_COMMAND, null);
    return;
  }
  $insertBlock(type);
}
