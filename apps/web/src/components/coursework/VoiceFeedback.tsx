import { MediaPlayer } from "@faridalms/editor/media-view";
import { VoiceRecorder } from "@faridalms/editor/recorder";
import { Button } from "@faridalms/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useDocumentMedia } from "~/hooks/useDocumentMedia";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import {
  addFeedbackRecording,
  removeFeedbackRecording,
} from "~/server/coursework";
import { getMessageFromError } from "~/utils/error";

interface Recording {
  id: string;
}

const recorderStrings = () => ({
  record: m.voiceRecord(),
  stop: m.voiceStop(),
  again: m.voiceAgain(),
  discard: m.voiceDiscard(),
  keep: m.voiceKeep(),
  refused: m.voiceRefused(),
  elapsed: (recorded: string, most: string) =>
    m.voiceElapsed({ recorded, most }),
  captions: m.editorCaptions(),
});

export interface RecordingsProps {
  recordings: Recording[];
  onRemove?: (recording: Recording) => void;
}

/** The recordings on an attempt, played back as they will be heard. */
export function Recordings({ recordings, onRemove }: RecordingsProps) {
  return (
    <ul className="grid gap-2">
      {recordings.map((recording) => (
        <li key={recording.id} className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <MediaPlayer
              src={`/files/${recording.id}`}
              captions={undefined}
              video={false}
              locale={getLocale()}
              captionsLabel={m.editorCaptions()}
            />
          </div>
          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={m.courseworkVoiceRemove()}
              onClick={() => onRemove(recording)}
            >
              <Trash2 aria-hidden />
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export interface VoiceFeedbackProps {
  attemptId: string;
  recordings: Recording[];
}

/** Voice feedback on one attempt, recorded in the grade sheet. */
export function VoiceFeedback({ attemptId, recordings }: VoiceFeedbackProps) {
  const queryClient = useQueryClient();
  const media = useDocumentMedia();
  const settle = () =>
    queryClient.invalidateQueries({ queryKey: ["coursework"] });
  const add = useMutation({
    mutationFn: async (file: File) => {
      const uploaded = await media.upload(file, "media");
      return addFeedbackRecording({
        data: { attemptId, fileId: uploaded.fileId },
      });
    },
    onSuccess: settle,
    onError: (failure) => toast.error(getMessageFromError(failure)),
  });
  const remove = useMutation({
    mutationFn: (recording: Recording) =>
      removeFeedbackRecording({ data: { attemptId, fileId: recording.id } }),
    onSuccess: settle,
    onError: (failure) => toast.error(getMessageFromError(failure)),
  });
  return (
    <section aria-labelledby="grade-voice" className="grid gap-2">
      <div className="grid gap-0.5">
        <h3 id="grade-voice" className="text-sm leading-5 font-medium">
          {m.courseworkVoiceFeedback()}
        </h3>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.courseworkVoiceFeedbackHint()}
        </p>
      </div>
      {recordings.length ? (
        <Recordings
          recordings={recordings}
          onRemove={(recording) => remove.mutate(recording)}
        />
      ) : null}
      {add.isPending ? (
        <p className="flex items-center gap-2 text-[13px] leading-[18px] text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          {m.courseworkVoiceSaving()}
        </p>
      ) : (
        <VoiceRecorder
          strings={recorderStrings()}
          locale={getLocale()}
          onKeep={(file) => add.mutate(file)}
        />
      )}
    </section>
  );
}
