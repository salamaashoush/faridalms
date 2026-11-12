import type { ProjectFile } from "@faridalms/domain/project";

import { languageOf } from "@faridalms/domain/project";
import { Button } from "@faridalms/ui/button";
import { CodeXml } from "lucide-react";
import { useMemo, useState } from "react";

import { linkedPage, playedPage } from "~/components/code/project-page";
import { WebPreview } from "~/components/code/WebPreview";
import * as m from "~/i18n/messages";

import { DeviceProgram } from "./DeviceProgram";
import { ProjectProgram } from "./ProjectProgram";
import { ProjectStudio } from "./ProjectStudio";

export interface WebProjectViewProps {
  files: readonly ProjectFile[];
  title: string;
}

/**
 * A student's project as their teacher reads it: the page its files make,
 * or its program, and the project itself to open and try. Nothing the
 * teacher changes there is kept.
 */
export function WebProjectView({ files, title }: WebProjectViewProps) {
  const [page, setPage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const drawn = useMemo(() => playedPage(files, page), [files, page]);
  const language = languageOf(files);
  return (
    <div className="grid gap-2">
      {language === "microbit" ? (
        <DeviceProgram files={files} />
      ) : language === "python" ? (
        <div className="overflow-hidden rounded-lg border">
          <ProjectProgram files={files} />
        </div>
      ) : (
        <div className="flex h-80 flex-col overflow-hidden rounded-lg border">
          <WebPreview
            page={drawn}
            fill
            onOpen={(href) => {
              const next = linkedPage(files, href);
              if (next) setPage(next);
              return next !== null;
            }}
          />
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start max-md:h-10"
        onClick={() => setOpen(true)}
      >
        <CodeXml aria-hidden />
        {language === "microbit" ? m.codingOpenProject() : m.projectSeeCode()}
      </Button>
      {open ? (
        <ProjectStudio
          title={title}
          files={files}
          unkept
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
