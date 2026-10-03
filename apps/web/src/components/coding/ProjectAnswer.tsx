import { Button } from "@faridalms/ui/button";
import { Puzzle } from "lucide-react";
import { useState } from "react";

import * as m from "~/i18n/messages";

import { CodingStudio } from "./CodingStudio";
import { ProjectPlayer } from "./ProjectPlayer";

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
      <ProjectPlayer
        projectUrl={`/files/${project}`}
        stage={stage ? `/files/${stage}` : null}
        label={m.codingStageOf({ name })}
      />
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
