import type { CheckView, StudentBlock } from "@faridalms/domain/learning";

import { soundFormat } from "@faridalms/editor/recorder";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { Check, Mic, Pause, Play, RotateCcw, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import * as m from "~/i18n/messages";

import type { CheckDriver } from "../Checks";

import { stopSounds } from "../ReadAloud";
import { recordingUrl, useSpokenAnswer } from "../SpokenAnswer";
import { playSound } from "./sounds";

type Written = Extract<StudentBlock, { type: "written" }>;

/** A ring that fills as the recording uses up its time. */
function Ring({ share }: { share: number }) {
  const length = 2 * Math.PI * 56;
  return (
    <svg
      aria-hidden
      viewBox="0 0 120 120"
      className="pointer-events-none absolute inset-0 size-full -rotate-90"
    >
      <circle
        cx="60"
        cy="60"
        r="56"
        fill="none"
        strokeWidth="6"
        className="stroke-destructive/20"
      />
      <circle
        cx="60"
        cy="60"
        r="56"
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={length}
        strokeDashoffset={length * (1 - Math.min(1, share))}
        className="stroke-destructive"
      />
    </svg>
  );
}

const big = "relative size-30 rounded-full shadow-md";

/**
 * A spoken answer as a young child gives it: one big button to start and
 * stop, a ring showing the time left, then play it back, send it or try
 * again. Sent answers can be redone until the teacher has marked them.
 */
export function YoungSpoken({
  block,
  view,
  driver,
}: {
  block: Written;
  view: CheckView | undefined;
  driver: CheckDriver;
}) {
  const { send, heard } = useSpokenAnswer(block, driver);
  const [state, setState] = useState<"idle" | "recording" | "recorded">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [refused, setRefused] = useState(false);
  const [take, setTake] = useState<{
    file: File;
    url: string;
    seconds: number;
  } | null>(null);
  const [playing, setPlaying] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const player = useRef<HTMLAudioElement | null>(null);
  const most = block.recordSeconds ?? 45;
  const sent = recordingUrl(view, heard);
  const marked = view?.marked ?? false;

  // Leaving the screen lets go of the microphone and of the take's memory.
  useEffect(() => {
    const held = recorder;
    const ticking = timer;
    return () => {
      clearInterval(ticking.current);
      held.current?.stream.getTracks().forEach((track) => track.stop());
      if (held.current?.state === "recording") held.current.stop();
    };
  }, []);
  useEffect(
    () => () => {
      if (take) URL.revokeObjectURL(take.url);
    },
    [take],
  );

  const start = async () => {
    const format = soundFormat();
    if (!format) return;
    stopSounds();
    setRefused(false);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setRefused(true);
      return;
    }
    const chunks: Blob[] = [];
    const began = Date.now();
    const next = new MediaRecorder(stream, { mimeType: format.mimeType });
    next.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    next.addEventListener("stop", () => {
      clearInterval(timer.current);
      stream.getTracks().forEach((track) => track.stop());
      const file = new File(chunks, `answer.${format.extension}`, {
        type: format.mimeType.split(";")[0] ?? "audio/webm",
      });
      setTake({
        file,
        url: URL.createObjectURL(file),
        seconds: (Date.now() - began) / 1000,
      });
      setState("recorded");
    });
    recorder.current = next;
    next.start(1000);
    setElapsed(0);
    setState("recording");
    playSound("tap");
    timer.current = setInterval(() => {
      const passed = (Date.now() - began) / 1000;
      setElapsed(passed);
      if (passed >= most && next.state === "recording") next.stop();
    }, 200);
  };

  const listen = (url: string) => {
    stopSounds();
    player.current?.pause();
    const audio = new Audio(url);
    player.current = audio;
    audio.addEventListener("ended", () => setPlaying(false));
    setPlaying(true);
    void audio.play().catch(() => setPlaying(false));
  };

  if (!soundFormat()) return null;
  return (
    <div className="grid justify-items-center gap-6">
      {state === "idle" ? (
        <div className="flex flex-wrap items-center justify-center gap-6">
          {sent ? (
            <Button
              type="button"
              variant="outline"
              className={big}
              aria-label={playing ? m.lrnYoungPause() : m.lrnYoungListen()}
              onClick={() => (playing ? player.current?.pause() : listen(sent))}
            >
              {playing ? (
                <Pause aria-hidden className="size-12" />
              ) : (
                <Play aria-hidden className="size-12" />
              )}
            </Button>
          ) : null}
          {marked ? null : (
            <Button
              type="button"
              className={cn(
                big,
                "bg-destructive text-white hover:bg-destructive/90",
              )}
              aria-label={sent ? m.lrnYoungRecordAgain() : m.lrnYoungRecord()}
              onClick={() => void start()}
            >
              <Mic aria-hidden className="size-12" />
            </Button>
          )}
        </div>
      ) : state === "recording" ? (
        <Button
          type="button"
          variant="outline"
          className={big}
          aria-label={m.lrnYoungStop()}
          onClick={() => recorder.current?.stop()}
        >
          <Ring share={elapsed / most} />
          <Square
            aria-hidden
            className="size-10 fill-destructive text-destructive"
          />
        </Button>
      ) : take ? (
        <div className="flex flex-wrap items-center justify-center gap-6">
          <Button
            type="button"
            variant="outline"
            className="size-20 rounded-full"
            aria-label={m.lrnYoungRecordAgain()}
            onClick={() => void start()}
          >
            <RotateCcw aria-hidden className="size-8" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className={big}
            aria-label={playing ? m.lrnYoungPause() : m.lrnYoungListen()}
            onClick={() =>
              playing ? player.current?.pause() : listen(take.url)
            }
          >
            {playing ? (
              <Pause aria-hidden className="size-12" />
            ) : (
              <Play aria-hidden className="size-12" />
            )}
          </Button>
          <Button
            type="button"
            className={cn(big, "bg-success text-white hover:bg-success/90")}
            aria-label={m.lrnSendRecording()}
            disabled={send.isPending}
            onClick={() =>
              send.mutate(
                { file: take.file, seconds: take.seconds },
                {
                  onSuccess: () => {
                    playSound("right");
                    setTake(null);
                    setState("idle");
                  },
                },
              )
            }
          >
            <Check aria-hidden className="size-12" />
          </Button>
        </div>
      ) : null}
      <p
        aria-live="polite"
        className="text-center text-xl leading-8 font-semibold text-muted-foreground"
      >
        {refused
          ? m.voiceRefused()
          : state === "recording"
            ? m.lrnYoungListening()
            : state === "recorded"
              ? m.lrnYoungSendIt()
              : marked
                ? m.lrnMarked()
                : sent
                  ? m.lrnYoungSent()
                  : m.lrnYoungTapToRecord()}
      </p>
    </div>
  );
}
