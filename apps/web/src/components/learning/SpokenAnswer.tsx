import type { CheckView, StudentBlock } from "@faridalms/domain/learning";

import { MediaPlayer } from "@faridalms/editor/media-view";
import { VoiceRecorder } from "@faridalms/editor/recorder";
import { VideoRecorder } from "@faridalms/editor/video-recorder";
import { Button } from "@faridalms/ui/button";
import { useMutation } from "@tanstack/react-query";
import { Check, CircleCheck, LoaderCircle, Video } from "lucide-react";
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

const videoAnswerStrings = () => ({
  title: m.lrnRecordVideoTitle(),
  hint: m.lrnRecordVideoHint(),
  camera: m.videoRecordCamera(),
  screen: m.videoRecordScreen(),
  both: m.videoRecordBoth(),
  microphone: m.videoRecordMicrophone(),
  start: m.videoRecordStart(),
  pause: m.videoRecordPause(),
  resume: m.videoRecordResume(),
  stop: m.voiceStop(),
  again: m.voiceAgain(),
  keep: m.lrnSendRecording(),
  close: m.commonClose(),
  refused: m.videoRecordRefused(),
  startsIn: (seconds: number) =>
    m.videoRecordStartsIn({ seconds: formatNumber(seconds) }),
  elapsed: (recorded: string, most: string) =>
    m.voiceElapsed({ recorded, most }),
  captions: m.editorCaptions(),
  trimHint: m.videoRecordTrimHint(),
  startsAt: (time: string) => m.videoRecordStartsAt({ time }),
  endsAt: (time: string) => m.videoRecordEndsAt({ time }),
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
    mutationFn: async ({
      file,
      seconds,
      video = false,
    }: {
      file: File;
      seconds: number;
      video?: boolean;
    }) => {
      const kept = driver.keepFile
        ? await driver.keepFile(file)
        : {
            fileId: (await media.upload(file, "media")).fileId,
            url: null,
          };
      await driver.respond(block.id, {
        type: "written",
        text: "",
        recording: {
          fileId: kept.fileId,
          seconds,
          ...(video ? { video: true } : {}),
        },
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

/** A spoken answer for older students: record, listen or watch back, send. */
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
  const [filming, setFilming] = useState(false);
  const url = recordingUrl(view, heard);
  const video = Boolean(block.recordVideo);
  return (
    <div className="grid gap-3">
      {url ? (
        <MediaPlayer
          src={url}
          captions={undefined}
          video={video}
          locale={getLocale()}
          captionsLabel={m.editorCaptions()}
        />
      ) : null}
      {locked ? null : send.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          {m.lrnSendingRecording()}
        </p>
      ) : video ? (
        <>
          <Button
            type="button"
            variant="outline"
            className="justify-self-start max-md:h-10"
            onClick={() => setFilming(true)}
          >
            <Video aria-hidden />
            {url ? m.lrnRecordVideoAgain() : m.lrnRecordVideo()}
          </Button>
          <VideoRecorder
            open={filming}
            onOpenChange={setFilming}
            strings={videoAnswerStrings()}
            locale={getLocale()}
            maxSeconds={block.recordSeconds ?? 90}
            onKeep={(file, seconds) =>
              send.mutate({ file, seconds, video: true })
            }
          />
        </>
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
