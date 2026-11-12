import { Button } from "@faridalms/ui/button";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Puzzle } from "lucide-react";
import { useContext, useState } from "react";
import { toast } from "sonner";

import type { StudioAnswerProps } from "~/components/questions/slots";

import { OwnProjectsContext } from "~/components/code/own-code";
import { useDocumentMedia } from "~/hooks/useDocumentMedia";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { playQuery } from "~/queries/play";

import { CodingStudio, PROJECT_TYPE } from "./CodingStudio";
import { ProjectChecks, ProjectNotes } from "./ProjectChecks";
import { ProjectPlayer } from "./ProjectPlayer";
import { classGalleries } from "./slots";

/**
 * A coding question as its student meets it: their project's stage as they
 * last left it, and the studio to build it in. Every save goes to the
 * teacher as the answer; once marked, the project still opens to run and
 * read, but nothing changed there is kept. Where the question has a class
 * gallery, a classmate's project opens in the studio to build on, and each
 * save from then on says whose it began from.
 */
export function CodingAnswer({
  block,
  view,
  driver,
  mode,
  locked,
  status,
}: StudioAnswerProps<"scratch">) {
  const media = useDocumentMedia();
  const own = useContext(OwnProjectsContext);
  const queryClient = useQueryClient();
  const configured = Boolean(useQuery(playQuery).data);
  const [open, setOpen] = useState(false);
  const stored = view?.response?.type === "scratch" ? view.response : null;
  const [mine, setMine] = useState<{
    project: string;
    stage: string | null;
  } | null>(null);
  // The classmate's project being begun from, until its first save is kept.
  const [beginning, setBeginning] = useState<{
    studentId: string;
    name: string;
    projectUrl: string;
  } | null>(null);
  const [builtOn, setBuiltOn] = useState(stored?.remixOf);
  // The gallery is a lesson's: a quiz's answers are nobody's to see.
  const classGallery = useSlot(classGalleries)[0];
  const gallery =
    classGallery && block.gallery && mode !== "quiz" && own
      ? { ...classGallery, lessonId: own.lessonId, blockId: block.id }
      : null;
  const project =
    mine?.project ??
    (stored ? `/files/${stored.project.fileId}` : null) ??
    (block.starter ? `/files/${block.starter.fileId}` : null);
  const stage =
    mine?.stage ??
    (stored?.thumbnail ? `/files/${stored.thumbnail.fileId}` : null);

  const keep = async (file: File) => {
    if (driver.keepFile) return driver.keepFile(file);
    const uploaded = await media.upload(file, "file");
    return { fileId: uploaded.fileId, url: `/files/${uploaded.fileId}` };
  };

  return (
    <div className="grid gap-3">
      {project ? (
        <ProjectPlayer
          key={project}
          projectUrl={project}
          stage={stage}
          label={stored || mine ? m.codingYours() : m.codingStarter()}
        />
      ) : (
        <p className="flex max-w-md items-center gap-3 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          <Puzzle className="size-5 shrink-0" aria-hidden />
          {m.codingFromEmpty()}
        </p>
      )}
      {configured ? (
        <Button
          type="button"
          variant={stored || mine ? "outline" : "default"}
          className="justify-self-start max-md:h-10"
          onClick={() => setOpen(true)}
        >
          <Puzzle aria-hidden />
          {locked
            ? m.codingSee()
            : stored || mine
              ? m.codingKeepBuilding()
              : m.codingOpen()}
        </Button>
      ) : (
        <EmptyState
          placement="section"
          kind="restricted"
          title={m.studioUnavailable()}
        />
      )}
      <ProjectChecks asked={block.checks} has={stored?.has} />
      <ProjectNotes notes={stored?.notes} />
      <output className="grid gap-2 empty:hidden">{status}</output>
      {gallery ? (
        <gallery.Gallery
          lessonId={gallery.lessonId}
          blockId={gallery.blockId}
          settled={locked}
          onBuild={(from) => {
            setBeginning(from);
            setOpen(true);
          }}
        />
      ) : null}
      {open ? (
        <CodingStudio
          projectUrl={beginning?.projectUrl ?? project}
          mode="editor"
          title={block.prompt}
          begun={beginning !== null}
          onSave={
            locked
              ? undefined
              : async (projectBlob, stageBlob) => {
                  const kept = await keep(
                    new File([projectBlob], "project.sb3", {
                      type: PROJECT_TYPE,
                    }),
                  );
                  const shot = stageBlob
                    ? await keep(
                        new File([stageBlob], "stage.png", {
                          type: "image/png",
                        }),
                      )
                    : null;
                  const from = beginning?.studentId ?? builtOn;
                  await driver.respond(block.id, {
                    type: "scratch",
                    project: { fileId: kept.fileId },
                    ...(shot ? { thumbnail: { fileId: shot.fileId } } : {}),
                    ...(from ? { remixOf: from } : {}),
                  });
                  setMine({ project: kept.url, stage: shot?.url ?? null });
                  setBuiltOn(from);
                  if (beginning && from !== builtOn)
                    toast.success(m.galleryRemixed({ name: beginning.name }));
                  // A save is a newer project to offer, and the first opens the gallery.
                  if (gallery)
                    void queryClient.invalidateQueries({
                      queryKey: gallery.queryKey(
                        gallery.lessonId,
                        gallery.blockId,
                      ),
                    });
                }
          }
          onClose={() => {
            setOpen(false);
            setBeginning(null);
          }}
        />
      ) : null}
    </div>
  );
}
