import type { ProjectFile } from "@faridalms/domain/project";

import { blankOf, languageOf, sameFiles } from "@faridalms/domain/project";
import { Button } from "@faridalms/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CodeXml, Info, LoaderCircle, Send } from "lucide-react";
import { useContext, useMemo, useState } from "react";
import { toast } from "sonner";

import type { StudioAnswerProps } from "~/components/questions/slots";

import { OwnProjectsContext } from "~/components/code/own-code";
import { linkedPage, playedPage } from "~/components/code/project-page";
import { WebPreview } from "~/components/code/WebPreview";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { getLocale, getTextDirection } from "~/i18n/runtime";
import { getMessageFromError } from "~/utils/error";

import { DeviceProgram } from "./DeviceProgram";
import { ProjectProgram } from "./ProjectProgram";
import { ProjectStudio } from "./ProjectStudio";
import { classGalleries } from "./slots";

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
  status,
}: StudioAnswerProps<"project">) {
  const own = useContext(OwnProjectsContext);
  const queryClient = useQueryClient();
  const sent = view?.response?.type === "project" ? view.response.files : null;
  const starter = useMemo(() => {
    const locale = getLocale();
    return block.files.length > 0
      ? block.files
      : blankOf(block.language, locale, getTextDirection(locale) === "rtl");
  }, [block.files, block.language]);
  const kept = locked ? undefined : own?.projects[block.id];
  const [files, setFiles] = useState<readonly ProjectFile[]>(
    () => (locked ? sent : (kept?.files ?? sent)) ?? starter,
  );
  const [page, setPage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const drawn = useMemo(() => playedPage(files, page), [files, page]);
  // The gallery is a lesson's: a quiz's answers are nobody's to see.
  const classGallery = useSlot(classGalleries)[0];
  const gallery =
    classGallery && block.gallery && mode !== "quiz" && own
      ? { ...classGallery, lessonId: own.lessonId, blockId: block.id }
      : null;
  const handIn = useMutation({
    mutationFn: () =>
      driver.respond(block.id, { type: "project", files: [...files] }),
    // Handing in opens the gallery, and makes a newer project to offer it.
    onSuccess: () =>
      gallery
        ? queryClient.invalidateQueries({
            queryKey: gallery.queryKey(gallery.lessonId, gallery.blockId),
          })
        : undefined,
    onError: (error) => toast.error(getMessageFromError(error)),
  });

  const keep = locked
    ? undefined
    : mode === "quiz"
      ? (next: ProjectFile[]) =>
          driver.respond(block.id, { type: "project", files: next })
      : own
        ? (next: ProjectFile[], fresh: boolean) =>
            own.keep(block.id, next, fresh)
        : undefined;
  const changed = sent !== null && !sameFiles(sent, files);
  // One button leads: building until there is something to hand in, then
  // handing in until what was built has gone to the teacher.
  const built = !sameFiles(starter, files);
  const toHandIn =
    mode === "practice" && !locked && built && (sent === null || changed);

  return (
    <div className="grid gap-3">
      {languageOf(files) === "microbit" ? (
        <DeviceProgram files={files} />
      ) : languageOf(files) === "python" ? (
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
      <output className="grid gap-2 empty:hidden">{status}</output>
      {gallery ? (
        <gallery.Gallery
          lessonId={gallery.lessonId}
          blockId={gallery.blockId}
          settled={view?.marked ?? false}
          onRemixed={(next) => {
            setPage(null);
            setFiles(next);
          }}
        />
      ) : null}
      {open ? (
        <ProjectStudio
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
