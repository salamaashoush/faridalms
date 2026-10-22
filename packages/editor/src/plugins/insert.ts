import type { LexicalEditor } from "lexical";

import type { BlockType } from "../blocks";

import { $insertBlock } from "../blocks";
import { EDIT_DIAGRAM_COMMAND } from "../nodes";
import { OPEN_BANK_COMMAND } from "./bank";
import { OPEN_EMBED_COMMAND } from "./embed";
import { INSERT_MEDIA_COMMAND, RECORD_VIDEO_COMMAND } from "./media";
import { OPEN_SHARED_COMMAND } from "./shared";
import { IMPORT_WORD_COMMAND } from "./word";

export function $runBlock(editor: LexicalEditor, type: BlockType) {
  if (type === "image" || type === "file" || type === "media") {
    editor.dispatchCommand(INSERT_MEDIA_COMMAND, type);
    return;
  }
  if (type === "recording") {
    editor.dispatchCommand(RECORD_VIDEO_COMMAND, undefined);
    return;
  }
  if (type === "embed") {
    editor.dispatchCommand(OPEN_EMBED_COMMAND, undefined);
    return;
  }
  if (type === "bankQuestion") {
    editor.dispatchCommand(OPEN_BANK_COMMAND, undefined);
    return;
  }
  if (type === "sharedBlock") {
    editor.dispatchCommand(OPEN_SHARED_COMMAND, undefined);
    return;
  }
  if (type === "word") {
    editor.dispatchCommand(IMPORT_WORD_COMMAND, undefined);
    return;
  }
  if (type === "diagram") {
    editor.dispatchCommand(EDIT_DIAGRAM_COMMAND, null);
    return;
  }
  $insertBlock(type);
}
