import type { ProjectFile } from "@faridalms/domain/project";

import { Button } from "@faridalms/ui/button";
import { CodeXml } from "lucide-react";
import { useMemo, useState } from "react";

import * as m from "~/i18n/messages";

import { linkedPage, playedPage } from "./project-page";
import { WebPreview } from "./WebPreview";
import { WebProjectStudio } from "./WebProjectStudio";

/**
 * A student's web project as their teacher reads it: the page its files
 * make, and the files themselves to open, change and try. Nothing the
 * teacher changes there is kept.
 */
export function WebProjectView({
  files,
  title,
}: {
  files: readonly ProjectFile[];
  title: string;
}) {
  const [page, setPage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const drawn = useMemo(() => playedPage(files, page), [files, page]);
  return (
    <div className="grid gap-2">
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start max-md:h-10"
        onClick={() => setOpen(true)}
      >
        <CodeXml aria-hidden />
        {m.projectSeeCode()}
      </Button>
      {open ? (
        <WebProjectStudio
          title={title}
          files={files}
          unkept
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
