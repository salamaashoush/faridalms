import type { EditorPartProps } from "~/components/content/slots";
import type { ModuleFillings } from "~/utils/extension";

import { editorParts } from "~/components/content/slots";
import { studioAnswers } from "~/components/questions/slots";
import { fill } from "~/utils/extension";

import { CodingAnswer } from "./CodingAnswer";
import { MarkedProject } from "./MarkedProject";
import { useEditorPuzzles } from "./useEditorPuzzles";
import { useEditorStudio } from "./useEditorStudio";
import { WebProjectAnswer } from "./WebProjectAnswer";

/** The studio a coding question is built in, and the puzzles a teacher designs. */
function CodingEditorPart({ teaching, media, children }: EditorPartProps) {
  const coding = useEditorStudio(teaching ? media : undefined);
  const designing = useEditorPuzzles(teaching);
  return (
    <>
      {children({ studio: coding.studio, puzzles: designing.puzzles })}
      {coding.dialog}
      {designing.dialog}
    </>
  );
}

export const CODING: ModuleFillings = {
  module: "coding",
  fillings: [
    fill(studioAnswers, {
      Scratch: CodingAnswer,
      Project: WebProjectAnswer,
      holds: (answer) => answer.files !== null || answer.project !== null,
      Marked: MarkedProject,
    }),
    fill(editorParts, CodingEditorPart),
  ],
};
