import type { ProjectFile } from "@faridalms/domain/project";
import type { Ref } from "react";

import { fileKind, mainOf } from "@faridalms/domain/project";
import { Button } from "@faridalms/ui/button";
import { Play, Square } from "lucide-react";
import { useImperativeHandle } from "react";

import * as m from "~/i18n/messages";

import { RunOutput, useProgramRun } from "./ProgramRun";

/** What a key pressed elsewhere may ask of a project's program. */
export interface ProgramHandle {
  run: () => void;
}

export interface ProjectProgramProps {
  files: readonly ProjectFile[];
  /** Takes all the room it is given, scrolling what does not fit. */
  fill?: boolean;
  ref?: Ref<ProgramHandle>;
}

/**
 * A Python project as it runs: its main file, with the project's other
 * files there to import, and what the run prints and draws.
 */
export function ProjectProgram({
  files,
  fill = false,
  ref,
}: ProjectProgramProps) {
  const program = useProgramRun("python");
  const main = mainOf(files);
  const run = () => {
    if (!main) return;
    program.run(
      main.code,
      Object.fromEntries(
        files
          .filter((file) => file !== main && fileKind(file.name) === "py")
          .map((file) => [file.name, file.code]),
      ),
    );
  };
  useImperativeHandle(ref, () => ({ run }));
  return (
    <div
      className={fill ? "flex min-h-0 flex-1 flex-col overflow-y-auto" : "grid"}
    >
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 px-2">
        <span
          dir="ltr"
          className="px-1.5 font-mono text-[13px] text-muted-foreground"
        >
          {main?.name}
        </span>
        {program.busy ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="max-md:h-10"
            onClick={program.stop}
          >
            <Square aria-hidden />
            {m.codeStop()}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            className="max-md:h-10"
            disabled={!main}
            aria-keyshortcuts="Control+Enter Meta+Enter"
            onClick={run}
          >
            <Play aria-hidden />
            {m.codeRun()}
          </Button>
        )}
      </div>
      {program.busy || program.end ? null : (
        <p className="border-t px-3 py-2.5 text-[13px] leading-[18px] text-muted-foreground">
          {m.projectRunHint()}
        </p>
      )}
      <RunOutput
        run={program}
        code={files.map((file) => file.code).join("\n")}
      />
    </div>
  );
}
