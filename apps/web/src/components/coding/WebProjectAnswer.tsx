import type { CheckView, StudentBlock } from "@faridalms/domain/learning";
import type { ProjectFile } from "@faridalms/domain/project";

import { emptyProject, sameFiles } from "@faridalms/domain/project";
import { Button } from "@faridalms/ui/button";
import { useMutation } from "@tanstack/react-query";
import { CodeXml, Info, LoaderCircle, Send } from "lucide-react";
import { useContext, useMemo, useState } from "react";
import { toast } from "sonner";

import type { CheckDriver, CheckMode } from "~/components/learning/Checks";

import * as m from "~/i18n/messages";
import { getLocale, getTextDirection } from "~/i18n/runtime";
import { getMessageFromError } from "~/utils/error";

import { OwnProjectsContext } from "./own-code";
import { linkedPage, playedPage } from "./project-page";
import { WebPreview } from "./WebPreview";
import { WebProjectStudio } from "./WebProjectStudio";

type Project = Extract<StudentBlock, { type: "project" }>;

/**
 * A web project as its student meets it: the page their files make, and
 * the studio to write them in. In a lesson the project is kept as they
 * build and reaches the teacher when they hand it in; in a quiz it is kept
 * as their answer and handed in with the rest. Once marked, or read back,
 * it still opens to run and read, but nothing changed there is kept.
 */
export function WebProjectAnswer({
  block,
  view,
  driver,
  mode,
  locked,
}: {
  block: Project;
  view: CheckView | undefined;
  driver: CheckDriver;
  mode: CheckMode;
  locked: boolean;
}) {
  const own = useContext(OwnProjectsContext);
  const sent = view?.response?.type === "project" ? view.response.files : null;
  const starter = useMemo(() => {
    const locale = getLocale();
    return block.files.length > 0
      ? block.files
      : emptyProject(locale, getTextDirection(locale) === "rtl");
  }, [block.files]);
  const kept = locked ? undefined : own?.projects[block.id];
  const [files, setFiles] = useState<readonly ProjectFile[]>(
    () => (locked ? sent : (kept?.files ?? sent)) ?? starter,
  );
  const [page, setPage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const drawn = useMemo(() => playedPage(files, page), [files, page]);
  const handIn = useMutation({
    mutationFn: () =>
      driver.respond(block.id, { type: "project", files: [...files] }),
    onError: (error) => toast.error(getMessageFromError(error)),
  });

  const keep = locked
    ? undefined
    : mode === "quiz"
      ? (next: ProjectFile[]) =>
          driver.respond(block.id, { type: "project", files: next })
      : own
        ? (next: ProjectFile[]) => own.keep(block.id, next)
        : undefined;
  const changed = sent !== null && !sameFiles(sent, files);
  // One button leads: building until there is something to hand in, then
  // handing in until what was built has gone to the teacher.
  const built = !sameFiles(starter, files);
  const toHandIn =
    mode === "practice" && !locked && built && (sent === null || changed);

  return (
    <div className="grid gap-3">
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
      {changed && mode === "practice" && !locked ? (
        <p className="flex gap-2 text-[13px] leading-[18px] text-muted-foreground">
          <Info aria-hidden className="mt-px size-4 shrink-0" />
          {m.projectChanged()}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={toHandIn ? "outline" : "default"}
          className="max-md:h-10"
          onClick={() => setOpen(true)}
        >
          <CodeXml aria-hidden />
          {locked
            ? m.projectSeeCode()
            : built || sent
              ? m.codingKeepBuilding()
              : m.codingOpenProject()}
        </Button>
        {mode === "practice" && !locked ? (
          <Button
            type="button"
            variant={toHandIn ? "default" : "outline"}
            className="max-md:h-10"
            disabled={handIn.isPending || (sent !== null && !changed)}
            onClick={() => handIn.mutate()}
          >
            {handIn.isPending ? (
              <LoaderCircle aria-hidden className="animate-spin" />
            ) : (
              <Send aria-hidden />
            )}
            {sent ? m.projectHandInAgain() : m.projectHandIn()}
          </Button>
        ) : null}
      </div>
      {open ? (
        <WebProjectStudio
          title={block.prompt}
          files={files}
          starter={locked ? undefined : starter}
          note={kept?.changed ? m.projectStarterChanged() : undefined}
          onKeep={keep}
          unkept={locked}
          onClose={(next) => {
            // A marked project is read, not changed.
            if (!locked) setFiles(next);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
