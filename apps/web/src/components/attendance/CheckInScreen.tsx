import { shuffled } from "@faridalms/domain/learning";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { initialsOf } from "@faridalms/ui/system/app-shell";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { GrownUpQuestion } from "~/components/app/GrownUpQuestion";
import { classTitle } from "~/components/classes/format";
import { playSound } from "~/components/learning/young/sounds";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { registerQuery } from "~/queries/attendance";
import { checkInToRegister, undoCheckInToRegister } from "~/server/attendance";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { BadgeCamera } from "./BadgeCamera";
import { CardReader } from "./CardReader";
import { nfcAvailable } from "./nfc";

/** How long a child has to say a tap was not them. */
const UNDO_MS = 6000;

/** The name a child goes by, else their whole name. */
const firstOf = (student: {
  firstEn: string | null;
  firstAr: string | null;
  fullNameEn: string | null;
  fullNameAr: string | null;
}) =>
  inLocale(student.firstEn, student.firstAr) ||
  inLocale(student.fullNameEn, student.fullNameAr);

export interface CheckInScreenProps {
  classId: string;
  date: string;
  periodId: string;
  onClose: () => void;
}

/**
 * The classroom's screen while children mark themselves in: a big tile of
 * each child's photo and first name, in a new order every day so they look
 * for their name rather than a place. A tap marks them present; the teacher
 * confirms the register afterwards. The screen runs under the teacher's
 * session, so leaving it asks a grown-up's question.
 */
export function CheckInScreen({
  classId,
  date,
  periodId,
  onClose,
}: CheckInScreenProps) {
  const queryClient = useQueryClient();
  const data = useSuspenseQuery(registerQuery(classId, date, periodId)).data;
  const checkIn = useServerFn(checkInToRegister);
  const undo = useServerFn(undoCheckInToRegister);
  const [greeted, setGreeted] = useState<{ id: string; at: number } | null>(
    null,
  );
  const [leaving, setLeaving] = useState(0);
  const stage = useRef<HTMLDialogElement>(null);

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: registerQuery(classId, date, periodId).queryKey,
    });
  const arrived = async (result: { studentId: string }) => {
    playSound("right");
    setGreeted({ id: result.studentId, at: Date.now() });
    await refresh();
  };
  const tap = useMutation({
    mutationFn: (studentId: string) =>
      checkIn({
        data: {
          classId,
          date,
          periodId: data.period?.id ?? "",
          via: "touch",
          studentId,
        },
      }),
    onSuccess: arrived,
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const badge = useMutation({
    mutationFn: ({ secret, via }: { secret: string; via: "qr" | "nfc" }) =>
      checkIn({
        data: {
          classId,
          date,
          periodId: data.period?.id ?? "",
          via,
          badge: secret,
        },
      }),
    onSuccess: arrived,
    onError: () => {
      playSound("wrong");
      toast.error(m.attBadgeNotHere());
    },
  });
  const takeBack = useMutation({
    mutationFn: (studentId: string) =>
      undo({
        data: { classId, date, periodId: data.period?.id ?? "", studentId },
      }),
    onSuccess: async () => {
      setGreeted(null);
      await refresh();
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });

  useEffect(() => {
    if (!greeted) return undefined;
    const timer = setTimeout(() => setGreeted(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [greeted]);

  // The page under the screen stays still, and the screen fills the
  // display, which a classroom board is opened for.
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (document.fullscreenEnabled && !document.fullscreenElement)
      void stage.current?.requestFullscreen().catch(() => undefined);
    return () => {
      document.body.style.overflow = before;
      if (document.fullscreenElement)
        void document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  // Only Chrome on Android reads cards; elsewhere the other ways remain.
  const cards = data.checkIn.nfc && nfcAvailable();
  const here = new Set(
    data.marks
      .filter((mark) => mark.meaning === "present" || mark.meaning === "late")
      .map((mark) => mark.studentId),
  );
  const tiles = shuffled(data.students, `${classId}:${date}`);
  const greetedStudent = greeted
    ? data.students.find((student) => student.id === greeted.id)
    : undefined;

  return (
    <dialog
      ref={stage}
      open
      aria-label={m.attCheckInScreen()}
      className="fixed inset-0 z-50 m-0 flex size-full max-h-none max-w-none flex-col bg-background p-0 text-foreground"
    >
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h1 dir="auto" className="truncate text-2xl leading-8 font-bold">
            {classTitle(data.class)}
          </h1>
          <p className="text-lg leading-7 text-muted-foreground">
            {data.checkIn.touch ? m.attCheckInTap() : m.attCameraHold()}
          </p>
        </div>
        <p
          aria-live="polite"
          className="text-xl leading-8 font-semibold tabular-nums"
        >
          {m.attCheckInCount({
            count: formatNumber(here.size),
            total: formatNumber(data.students.length),
          })}
        </p>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => setLeaving((current) => current + 1)}
        >
          {m.attCheckInDone()}
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pb-8 md:flex-row md:items-start">
        {data.checkIn.qr || cards ? (
          <div className="grid gap-4 md:sticky md:top-0">
            {data.checkIn.qr ? (
              <BadgeCamera
                onBadge={(secret) => badge.mutate({ secret, via: "qr" })}
              />
            ) : null}
            {cards ? (
              <CardReader
                onBadge={(secret) => badge.mutate({ secret, via: "nfc" })}
              />
            ) : null}
          </div>
        ) : null}
        <ul className="grid flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4">
          {tiles.map((student) => {
            const done = here.has(student.id);
            const first = firstOf(student);
            return (
              <li key={student.id}>
                <button
                  type="button"
                  aria-pressed={done}
                  disabled={tap.isPending || !data.checkIn.touch}
                  onClick={() => {
                    if (done) return;
                    tap.mutate(student.id);
                  }}
                  className={cn(
                    "relative flex w-full touch-manipulation flex-col items-center gap-3 rounded-3xl border-4 bg-card p-4 transition-colors outline-none select-none focus-visible:ring-4 focus-visible:ring-ring/50",
                    done
                      ? "border-success bg-success/10"
                      : "border-transparent hover:border-primary/40 active:scale-[0.98] motion-reduce:active:scale-100",
                  )}
                >
                  {student.photoFileId ? (
                    <img
                      src={`/files/${student.photoFileId}`}
                      alt=""
                      draggable={false}
                      className="size-28 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="grid size-28 place-items-center rounded-full bg-primary/15 text-4xl font-bold text-primary"
                    >
                      {initialsOf(first)}
                    </span>
                  )}
                  <span
                    dir="auto"
                    className="max-w-full truncate text-2xl leading-8 font-semibold"
                  >
                    {first}
                  </span>
                  {done ? (
                    <span
                      aria-hidden
                      className="absolute end-2 top-2 grid size-10 place-items-center rounded-full bg-success text-white"
                    >
                      <Check className="size-6" />
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {greetedStudent ? (
        <output className="pointer-events-none fixed inset-x-0 bottom-8 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-4 rounded-full border bg-card py-3 ps-3 pe-4 shadow-lg">
            {greetedStudent.photoFileId ? (
              <img
                src={`/files/${greetedStudent.photoFileId}`}
                alt=""
                className="size-14 rounded-full object-cover"
              />
            ) : null}
            <span dir="auto" className="text-2xl leading-8 font-semibold">
              {m.attCheckInHello({ name: firstOf(greetedStudent) })}
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={takeBack.isPending}
              onClick={() => takeBack.mutate(greetedStudent.id)}
            >
              <X aria-hidden />
              {m.attCheckInNotMe()}
            </Button>
          </div>
        </output>
      ) : null}
      <GrownUpQuestion
        key={leaving}
        open={leaving > 0}
        onOpenChange={(open) => {
          if (!open) setLeaving(0);
        }}
        onPass={onClose}
      />
    </dialog>
  );
}
