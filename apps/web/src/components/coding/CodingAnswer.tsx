import type { CheckView, StudentBlock } from "@faridalms/domain/learning";

import { Button } from "@faridalms/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Puzzle } from "lucide-react";
import { useState } from "react";

import type { CheckDriver } from "~/components/learning/Checks";

import { useDocumentMedia } from "~/components/coursework/useDocumentMedia";
import * as m from "~/i18n/messages";
import { playQuery } from "~/queries/play";

import { CodingStudio, PROJECT_TYPE } from "./CodingStudio";
import { ProjectPlayer } from "./ProjectPlayer";

type Coding = Extract<StudentBlock, { type: "scratch" }>;

/**
 * A coding question as its student meets it: their project's stage as they
 * last left it, and the studio to build it in. Every save goes to the
 * teacher as the answer; once marked, the project still opens to run and
 * read, but nothing changed there is kept.
 */
export function CodingAnswer({
  block,
  view,
  driver,
  locked,
}: {
  block: Coding;
  view: CheckView | undefined;
  driver: CheckDriver;
  locked: boolean;
}) {
  const media = useDocumentMedia();
  const configured = Boolean(useQuery(playQuery).data);
  const [open, setOpen] = useState(false);
  const stored = view?.response?.type === "scratch" ? view.response : null;
  const [mine, setMine] = useState<{
    project: string;
    stage: string | null;
  } | null>(null);
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
        <p className="text-sm text-muted-foreground">{m.studioUnavailable()}</p>
      )}
      {open ? (
        <CodingStudio
          projectUrl={project}
          mode="editor"
          title={block.prompt}
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
                  await driver.respond(block.id, {
                    type: "scratch",
                    project: { fileId: kept.fileId },
                    ...(shot ? { thumbnail: { fileId: shot.fileId } } : {}),
                  });
                  setMine({ project: kept.url, stage: shot?.url ?? null });
                }
          }
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
