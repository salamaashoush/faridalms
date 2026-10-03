import { StoredImage } from "@faridalms/editor/files";
import { Button } from "@faridalms/ui/button";
import { Puzzle } from "lucide-react";
import { useState } from "react";

import * as m from "~/i18n/messages";

import { CodingStudio } from "./CodingStudio";

/**
 * A student's coding project as their teacher reads it: its stage, and the
 * project itself to open, run and read the code of. Nothing the teacher
 * changes there is kept.
 */
export function ProjectAnswer({
  project,
  stage,
  name,
}: {
  project: string;
  stage: string | null;
  name: string;
}) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="grid justify-items-start gap-2">
      {stage ? (
        <StoredImage
          src={`/files/${stage}`}
          alt={m.codingStageOf({ name })}
          removed={m.fileRemoved()}
          className="max-h-60 w-auto max-w-full rounded-lg border bg-white object-contain"
        />
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="max-md:h-10"
        onClick={() => setPlaying(true)}
      >
        <Puzzle aria-hidden />
        {m.codingOpenProject()}
      </Button>
      {playing ? (
        <CodingStudio
          projectUrl={`/files/${project}`}
          mode="editor"
          title={name}
          onClose={() => setPlaying(false)}
        />
      ) : null}
    </div>
  );
}
