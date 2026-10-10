import type { ProjectFile } from "@faridalms/domain/project";

import { Button } from "@faridalms/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppWindow, Images } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { displayName } from "~/components/people/format";
import { ConfirmDialog } from "~/components/system/ConfirmDialog";
import * as m from "~/i18n/messages";
import { galleryQuery } from "~/queries/learning";
import {
  offerToGallery,
  remixFromGallery,
  takeFromGallery,
} from "~/server/learning";
import { getMessageFromError } from "~/utils/error";

import { ProjectStudio } from "./ProjectStudio";

const failed = (error: unknown) => toast.error(getMessageFromError(error));

/**
 * A project question's class gallery, under a student's own project: where
 * their offer to show it stands, and the classmates' projects their
 * teacher has shown, each to open, try, and build on. It opens once the
 * student has handed in a project of their own.
 */
export function ProjectGallery({
  lessonId,
  blockId,
  settled,
  onRemixed,
}: {
  lessonId: string;
  blockId: string;
  /** The student's project is marked, so it can no longer begin again. */
  settled: boolean;
  onRemixed: (files: ProjectFile[]) => void;
}) {
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
            <p className="rounded-lg border border-dashed px-4 py-3 text-[13px] leading-[18px] text-muted-foreground">
              {m.galleryEmpty()}
            </p>
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
                      <AppWindow
                        aria-hidden
                        className="size-5 shrink-0 text-muted-foreground"
                      />
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
          {m.galleryAfterHandIn()}
        </p>
      )}
      {showing ? (
        <ProjectStudio
          title={m.galleryBy({ name: maker })}
          files={showing.files}
          unkept
          action={
            settled
              ? undefined
              : {
                  label: m.galleryRemix(),
                  onSelect: () => setConfirming(true),
                }
          }
          onClose={() => setOpened(null)}
        />
      ) : null}
      <ConfirmDialog
        open={confirming && showing !== undefined}
        title={m.galleryRemixTitle({ name: maker })}
        body={m.galleryRemixBody()}
        confirmLabel={m.galleryRemix()}
        pending={remix.isPending}
        onConfirm={() => {
          if (!showing) return;
          remix.mutate(showing.studentId, {
            onSuccess: ({ files }) => {
              setConfirming(false);
              setOpened(null);
              onRemixed(files);
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
