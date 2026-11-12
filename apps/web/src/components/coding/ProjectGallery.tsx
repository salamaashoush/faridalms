import { Button } from "@faridalms/ui/button";
import { ConfirmDialog } from "@faridalms/ui/system/confirm-dialog";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { StatusBadge } from "@faridalms/ui/system/status";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppWindow, Images } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { displayName } from "~/components/people/format";
import * as m from "~/i18n/messages";
import { galleryQuery } from "~/queries/learning";
import {
  decideGalleryOffer,
  offerToGallery,
  remixFromGallery,
  takeFromGallery,
} from "~/server/learning";
import { getMessageFromError } from "~/utils/error";

import type { ClassGalleryProps, GalleryOfferProps } from "./slots";

import { CodingStudio } from "./CodingStudio";
import { ProjectStudio } from "./ProjectStudio";

const failed = (error: unknown) => toast.error(getMessageFromError(error));

/**
 * A project question's class gallery, under a student's own project: where
 * their offer to show it stands, and the classmates' projects their
 * teacher has shown, each to open, try, and build on. It opens once the
 * student has handed in a project of their own. A project of files is
 * begun again here, the server putting the classmate's in place of the
 * student's own; a coding project is handed to `onBuild`, whose studio
 * opens it and saves it as the student's.
 */
export function ProjectGallery({
  lessonId,
  blockId,
  settled,
  onRemixed,
  onBuild,
}: ClassGalleryProps) {
  const queryClient = useQueryClient();
  const query = galleryQuery(lessonId, blockId);
  const data = useQuery(query).data;
  const [opened, setOpened] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const again = () =>
    queryClient.invalidateQueries({ queryKey: query.queryKey });
  const offer = useMutation({
    mutationFn: () => offerToGallery({ data: { lessonId, blockId } }),
    onSuccess: again,
    onError: failed,
  });
  const takeBack = useMutation({
    mutationFn: () => takeFromGallery({ data: { lessonId, blockId } }),
    onSuccess: again,
    onError: failed,
  });
  const remix = useMutation({
    mutationFn: (studentId: string) =>
      remixFromGallery({ data: { lessonId, blockId, studentId } }),
    onError: failed,
  });
  if (!data) return null;

  const names = new Map(
    data.students.map((student) => [student.id, displayName(student)]),
  );
  const showing = data.projects.find((item) => item.studentId === opened);
  const maker = showing ? (names.get(showing.studentId) ?? "") : "";
  const busy = offer.isPending || takeBack.isPending;
  const state = data.mine?.state ?? null;
  const build = {
    label: m.galleryRemix(),
    onSelect: () => setConfirming(true),
  };
  return (
    <section className="grid gap-3 border-t pt-4">
      <h4 className="flex items-center gap-2 text-sm leading-5 font-semibold">
        <Images aria-hidden className="size-4 text-muted-foreground" />
        {m.galleryTitle()}
      </h4>
      {data.handedIn ? (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              {state === "shown"
                ? m.galleryShown()
                : state === "offered"
                  ? m.galleryOffered()
                  : state === "declined"
                    ? m.galleryDeclined()
                    : m.galleryOfferHint()}
            </p>
            {state === null || state === "declined" || !data.mine?.latest ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="max-md:h-10"
                disabled={busy}
                onClick={() => offer.mutate()}
              >
                {state === null
                  ? m.galleryOffer()
                  : state === "declined"
                    ? m.galleryOfferAgain()
                    : m.galleryOfferNewer()}
              </Button>
            ) : null}
            {state === null ? null : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="max-md:h-10"
                disabled={busy}
                onClick={() => takeBack.mutate()}
              >
                {m.galleryTakeBack()}
              </Button>
            )}
          </div>
          {data.projects.length === 0 ? (
            <EmptyState placement="section" title={m.galleryEmpty()} />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {data.projects.map((item) => {
                const from = item.remixOf ? names.get(item.remixOf) : null;
                return (
                  <li key={item.studentId}>
                    <button
                      type="button"
                      className="flex min-h-12 w-full items-center gap-3 rounded-lg border bg-background px-3 py-2 text-start outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                      onClick={() => setOpened(item.studentId)}
                    >
                      {item.studio?.thumbnailFileId ? (
                        // A coding project's stage is white where nothing is drawn.
                        <img
                          src={`/files/${item.studio.thumbnailFileId}`}
                          alt=""
                          className="h-9 w-12 shrink-0 rounded border bg-white object-contain"
                        />
                      ) : (
                        <AppWindow
                          aria-hidden
                          className="size-5 shrink-0 text-muted-foreground"
                        />
                      )}
                      <span className="grid min-w-0">
                        <span className="truncate text-sm leading-5 font-medium">
                          {m.galleryBy({
                            name: names.get(item.studentId) ?? "",
                          })}
                        </span>
                        {item.remixOf ? (
                          <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
                            {from
                              ? m.galleryRemixOf({ name: from })
                              : m.galleryRemixOfSomeone()}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {onBuild ? m.galleryAfterSave() : m.galleryAfterHandIn()}
        </p>
      )}
      {showing?.studio ? (
        <CodingStudio
          projectUrl={`/files/${showing.studio.projectFileId}`}
          mode="editor"
          title={m.galleryBy({ name: maker })}
          action={settled ? undefined : build}
          onClose={() => setOpened(null)}
        />
      ) : showing ? (
        <ProjectStudio
          title={m.galleryBy({ name: maker })}
          files={showing.files}
          unkept
          action={settled ? undefined : build}
          onClose={() => setOpened(null)}
        />
      ) : null}
      <ConfirmDialog
        open={confirming && showing !== undefined}
        title={m.galleryRemixTitle({ name: maker })}
        body={showing?.studio ? m.galleryBuildBody() : m.galleryRemixBody()}
        confirmLabel={m.galleryRemix()}
        pending={remix.isPending}
        onConfirm={() => {
          if (!showing) return;
          if (showing.studio) {
            setConfirming(false);
            setOpened(null);
            onBuild?.({
              studentId: showing.studentId,
              name: maker,
              projectUrl: `/files/${showing.studio.projectFileId}`,
            });
            return;
          }
          remix.mutate(showing.studentId, {
            onSuccess: ({ files }) => {
              setConfirming(false);
              setOpened(null);
              onRemixed?.(files);
              toast.success(m.galleryRemixed({ name: maker }));
              // The lesson's own copy of the kept project is now behind.
              void queryClient.invalidateQueries({ queryKey: ["learning"] });
            },
          });
        }}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}

/**
 * A project a student offered to the class gallery, for their teacher to
 * show to the class, keep out, or take down again. A student who has sent
 * a newer project since offered the one before it, which is what the class
 * would see: that one opens from here, so nothing is shown unseen.
 */
export function GalleryOffer({ answer, name }: GalleryOfferProps) {
  const [looking, setLooking] = useState(false);
  const queryClient = useQueryClient();
  const decide = useMutation({
    mutationFn: (show: boolean) =>
      decideGalleryOffer({
        data: {
          lessonId: answer.lessonId,
          blockId: answer.blockId,
          studentId: answer.studentId,
          show,
        },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["learning", "answers"] }),
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  if (!answer.share) return null;
  const shown = answer.share === "shown";
  const earlier = answer.share === "declined" ? null : answer.offered;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {earlier ? (
        <p className="flex basis-full flex-wrap items-center gap-x-3 gap-y-1 text-[13px] leading-[18px] text-muted-foreground">
          {m.galleryTeacherEarlier()}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="max-md:h-10"
            onClick={() => setLooking(true)}
          >
            {m.galleryTeacherSeeOffered()}
          </Button>
        </p>
      ) : null}
      {looking && earlier?.files ? (
        <ProjectStudio
          title={m.galleryTeacherOfferedBy({ name })}
          files={earlier.files}
          unkept
          onClose={() => setLooking(false)}
        />
      ) : looking && earlier?.project ? (
        <CodingStudio
          projectUrl={`/files/${earlier.project.fileId}`}
          mode="editor"
          title={m.galleryTeacherOfferedBy({ name })}
          onClose={() => setLooking(false)}
        />
      ) : null}
      <StatusBadge
        tone={
          shown ? "success" : answer.share === "offered" ? "info" : "neutral"
        }
      >
        {shown
          ? m.galleryTeacherShown()
          : answer.share === "offered"
            ? m.galleryTeacherOffered()
            : m.galleryTeacherDeclined()}
      </StatusBadge>
      {shown ? null : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-md:h-10"
          disabled={decide.isPending}
          onClick={() => decide.mutate(true)}
        >
          {m.galleryShow()}
        </Button>
      )}
      {answer.share === "declined" ? null : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="max-md:h-10"
          disabled={decide.isPending}
          onClick={() => decide.mutate(false)}
        >
          {shown ? m.galleryTakeDown() : m.galleryNotNow()}
        </Button>
      )}
    </div>
  );
}
