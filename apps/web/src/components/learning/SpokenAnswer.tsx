import type { CheckView, StudentBlock } from "@faridalms/domain/learning";

import { MediaPlayer } from "@faridalms/editor/media-view";
import { VoiceRecorder } from "@faridalms/editor/recorder";
import { useMutation } from "@tanstack/react-query";
import { Check, CircleCheck, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useDocumentMedia } from "~/components/coursework/useDocumentMedia";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { CheckDriver } from "./Checks";

type Written = Extract<StudentBlock, { type: "written" }>;

export const recorderStrings = () => ({
  record: m.voiceRecord(),
  stop: m.voiceStop(),
  again: m.voiceAgain(),
  discard: m.voiceDiscard(),
  keep: m.lrnSendRecording(),
  refused: m.voiceRefused(),
  elapsed: (recorded: string, most: string) =>
    m.voiceElapsed({ recorded, most }),
  captions: m.editorCaptions(),
});

/**
 * Sends a spoken answer: the recording is stored first, then answered with,
 * so an answer never points at sound that did not arrive. A teacher's
 * preview keeps it in the page instead.
 */
export function useSpokenAnswer(block: Written, driver: CheckDriver) {
  const media = useDocumentMedia();
  const [heard, setHeard] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: async ({ file, seconds }: { file: File; seconds: number }) => {
      const kept = driver.keepFile
        ? await driver.keepFile(file)
        : {
            fileId: (await media.upload(file, "media")).fileId,
            url: null,
          };
      await driver.respond(block.id, {
        type: "written",
        text: "",
        recording: { fileId: kept.fileId, seconds },
      });
      setHeard(kept.url);
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  return { send, heard };
}

/** Where a sent recording plays from: the page's own copy, else the stored file. */
export const recordingUrl = (
  view: CheckView | undefined,
  heard: string | null,
) =>
  heard ??
  (view?.response?.type === "written" && view.response.recording
    ? `/files/${view.response.recording.fileId}`
    : null);

/** A teacher's mark on a spoken answer, or that it is with them. */
export function SpokenStatus({
  block,
  view,
}: {
  block: Pick<Written, "points">;
  view: CheckView | undefined;
}) {
  if (!view || view.tries === 0) return null;
  if (!view.marked)
    return (
      <p className="inline-flex items-center gap-2 text-sm leading-5 text-muted-foreground">
        <Check aria-hidden className="size-4" />
        {block.points > 0 ? m.lrnWaitingMark() : m.lrnAnswerSaved()}
      </p>
    );
  return (
    <>
      <p className="inline-flex items-center gap-2 text-sm leading-5 font-medium">
        <CircleCheck aria-hidden className="size-4 text-success" />
        {view.credit !== null
          ? m.lrnMarkedPoints({
              points: formatNumber(view.credit),
              total: formatNumber(block.points),
            })
          : m.lrnMarked()}
      </p>
      {view.markFeedback ? (
        <div className="grid gap-1 rounded-md bg-muted/60 px-3 py-2">
          <p className="text-[13px] leading-[18px] font-medium text-muted-foreground">
            {m.lrnTeacherFeedback()}
          </p>
          <p dir="auto" className="text-sm leading-6 whitespace-pre-wrap">
            {view.markFeedback}
          </p>
        </div>
      ) : null}
    </>
  );
}

/** A spoken answer for older students: record, listen back, send. */
export function SpokenRecorder({
  block,
  view,
  driver,
  locked,
}: {
  block: Written;
  view: CheckView | undefined;
  driver: CheckDriver;
  locked: boolean;
}) {
  const { send, heard } = useSpokenAnswer(block, driver);
  const url = recordingUrl(view, heard);
  return (
    <div className="grid gap-3">
      {url ? (
        <MediaPlayer
          src={url}
          captions={undefined}
          video={false}
          locale={getLocale()}
          captionsLabel={m.editorCaptions()}
        />
      ) : null}
      {locked ? null : send.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          {m.lrnSendingRecording()}
        </p>
      ) : (
        <VoiceRecorder
          strings={recorderStrings()}
          locale={getLocale()}
          maxSeconds={block.recordSeconds ?? 90}
          onKeep={(file, seconds) => send.mutate({ file, seconds })}
        />
      )}
    </div>
  );
}
