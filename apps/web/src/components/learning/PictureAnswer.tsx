import type { CheckView, StudentBlock } from "@faridalms/domain/learning";

import { StoredImage } from "@faridalms/editor/files";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { useMutation } from "@tanstack/react-query";
import {
  Camera,
  Check,
  Eraser,
  LoaderCircle,
  Pencil,
  RotateCcw,
  Trash2,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useDocumentMedia } from "~/components/coursework/useDocumentMedia";
import * as m from "~/i18n/messages";
import { getMessageFromError } from "~/utils/error";

import type { CheckDriver } from "./Checks";

import { playSound } from "./young/sounds";

type Written = Extract<StudentBlock, { type: "written" }>;

// Eight strong colours that stay apart for most colour-blind children, each
// named for whoever cannot tell them by sight.
const COLOURS = [
  { value: "#1f2937", name: m.drawBlack },
  { value: "#dc2626", name: m.drawRed },
  { value: "#f97316", name: m.drawOrange },
  { value: "#facc15", name: m.drawYellow },
  { value: "#16a34a", name: m.drawGreen },
  { value: "#2563eb", name: m.drawBlue },
  { value: "#9333ea", name: m.drawPurple },
  { value: "#92400e", name: m.drawBrown },
];

// The page is drawn at a fixed size and scaled to the screen, so a drawing
// looks the same on a phone, a tablet and the teacher's laptop.
const WIDTH = 1200;
const HEIGHT = 900;
const THIN = 10;
const THICK = 28;
// The longest side a photo keeps: enough to read a child's writing.
const PHOTO_SIDE = 1600;

interface Stroke {
  colour: string;
  width: number;
  points: number[];
}

function drawStroke(context: CanvasRenderingContext2D, stroke: Stroke) {
  const [x = 0, y = 0] = stroke.points;
  context.strokeStyle = stroke.colour;
  context.fillStyle = stroke.colour;
  context.lineWidth = stroke.width;
  context.lineCap = "round";
  context.lineJoin = "round";
  if (stroke.points.length <= 2) {
    context.beginPath();
    context.arc(x, y, stroke.width / 2, 0, Math.PI * 2);
    context.fill();
    return;
  }
  context.beginPath();
  context.moveTo(x, y);
  for (let index = 2; index < stroke.points.length; index += 2)
    context.lineTo(stroke.points[index] ?? x, stroke.points[index + 1] ?? y);
  context.stroke();
}

function paint(canvas: HTMLCanvasElement | null, strokes: readonly Stroke[]) {
  const context = canvas?.getContext("2d");
  if (!context) return;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, WIDTH, HEIGHT);
  strokes.forEach((stroke) => drawStroke(context, stroke));
}

/**
 * A page to draw on with a finger, a pen or a mouse: eight colours, a thin
 * and a thick pen, an eraser, undo, and starting again, which takes a second
 * tap so a slip never wipes a child's picture.
 */
function DrawingPad({
  young,
  pending,
  onDone,
}: {
  young: boolean;
  pending: boolean;
  onDone: (file: File) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<Stroke | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [colour, setColour] = useState(COLOURS[0]?.value ?? "#000000");
  const [width, setWidth] = useState(THICK);
  const [erasing, setErasing] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => paint(canvas.current, strokes), [strokes]);
  useEffect(() => {
    const timer = clearing
      ? setTimeout(() => setClearing(false), 3000)
      : undefined;
    return () => clearTimeout(timer);
  }, [clearing]);

  const pointOf = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return [
      ((event.clientX - box.left) / box.width) * WIDTH,
      ((event.clientY - box.top) / box.height) * HEIGHT,
    ];
  };
  const extend = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = drawing.current;
    const context = canvas.current?.getContext("2d");
    if (!stroke || !context) return;
    // Safari before 18 has no coalesced events; the move itself then serves.
    const coalesced =
      "getCoalescedEvents" in event.nativeEvent
        ? event.nativeEvent.getCoalescedEvents()
        : [];
    const events = coalesced.length > 0 ? coalesced : [event.nativeEvent];
    const box = event.currentTarget.getBoundingClientRect();
    for (const each of events)
      stroke.points.push(
        ((each.clientX - box.left) / box.width) * WIDTH,
        ((each.clientY - box.top) / box.height) * HEIGHT,
      );
    // Only the new stretch is drawn, joined to the point before it.
    drawStroke(context, {
      ...stroke,
      points: stroke.points.slice(
        Math.max(0, stroke.points.length - 2 * (events.length + 1)),
      ),
    });
  };

  const tool = young ? "size-16" : "size-11";
  return (
    <div className="grid gap-3">
      <p className="sr-only">{m.drawHere()}</p>
      <canvas
        ref={canvas}
        width={WIDTH}
        height={HEIGHT}
        aria-hidden
        className="aspect-[4/3] w-[min(100%,calc(50dvh*4/3))] touch-none justify-self-center rounded-2xl border-2 bg-white shadow-sm"
        onPointerDown={(event) => {
          if (pending) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          const [x = 0, y = 0] = pointOf(event);
          drawing.current = {
            colour: erasing ? "#ffffff" : colour,
            width: erasing ? THICK * 2 : width,
            points: [x, y],
          };
          paint(canvas.current, [...strokes, drawing.current]);
        }}
        onPointerMove={extend}
        onPointerUp={() => {
          const done = drawing.current;
          drawing.current = null;
          if (done) setStrokes((current) => [...current, done]);
        }}
        onPointerCancel={() => {
          drawing.current = null;
          paint(canvas.current, strokes);
        }}
      />
      <div className="flex flex-wrap items-center justify-center gap-2">
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">{m.drawColours()}</legend>
          {COLOURS.map((item) => {
            const chosen = !erasing && colour === item.value;
            return (
              <button
                key={item.value}
                type="button"
                aria-pressed={chosen}
                aria-label={item.name()}
                onClick={() => {
                  setColour(item.value);
                  setErasing(false);
                }}
                className={cn(
                  "grid touch-manipulation place-items-center rounded-full border-2 border-white shadow outline-none focus-visible:ring-4 focus-visible:ring-ring/50",
                  tool,
                  chosen && "ring-4 ring-primary",
                )}
                style={{ backgroundColor: item.value }}
              >
                {chosen ? (
                  <Check
                    aria-hidden
                    className={cn(
                      "size-6",
                      item.value === "#facc15"
                        ? "text-neutral-900"
                        : "text-white",
                    )}
                  />
                ) : null}
              </button>
            );
          })}
        </fieldset>
        <div className="flex flex-wrap gap-2">
          {[
            { size: THIN, label: m.drawThin(), dot: "size-2" },
            { size: THICK, label: m.drawThick(), dot: "size-5" },
          ].map((pen) => (
            <Button
              key={pen.size}
              type="button"
              variant="outline"
              aria-pressed={!erasing && width === pen.size}
              aria-label={pen.label}
              className={cn(
                tool,
                "rounded-full aria-pressed:border-primary aria-pressed:bg-primary/10",
              )}
              onClick={() => {
                setWidth(pen.size);
                setErasing(false);
              }}
            >
              <span
                aria-hidden
                className={cn("rounded-full", pen.dot)}
                style={{ backgroundColor: colour }}
              />
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            aria-pressed={erasing}
            aria-label={m.drawEraser()}
            className={cn(
              tool,
              "rounded-full aria-pressed:border-primary aria-pressed:bg-primary/10",
            )}
            onClick={() => setErasing(true)}
          >
            <Eraser aria-hidden className="size-6" />
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label={m.drawUndo()}
            className={cn(tool, "rounded-full")}
            disabled={strokes.length === 0}
            onClick={() => setStrokes((current) => current.slice(0, -1))}
          >
            <Undo2 aria-hidden className="size-6" />
          </Button>
          <Button
            type="button"
            variant={clearing ? "destructive" : "outline"}
            aria-label={clearing ? m.drawClearConfirm() : m.drawClear()}
            className={cn(tool, "rounded-full")}
            disabled={strokes.length === 0}
            onClick={() => {
              if (!clearing) {
                setClearing(true);
                return;
              }
              setClearing(false);
              setStrokes([]);
            }}
          >
            <Trash2 aria-hidden className="size-6" />
          </Button>
          <Button
            type="button"
            className={cn(
              "rounded-full bg-success text-white hover:bg-success/90",
              young ? "h-16 px-8 text-xl" : "h-11 px-5",
            )}
            disabled={strokes.length === 0 || pending}
            onClick={() =>
              canvas.current?.toBlob((blob) => {
                if (blob)
                  onDone(
                    new File([blob], "drawing.png", { type: "image/png" }),
                  );
              }, "image/png")
            }
          >
            {pending ? (
              <LoaderCircle aria-hidden className="animate-spin" />
            ) : (
              <Check aria-hidden className="size-6" />
            )}
            {m.drawDone()}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * A photo as a smaller JPEG: what a phone camera takes is many megabytes,
 * and drawing it again leaves behind the place and time it carried.
 */
async function shrunk(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(
      1,
      PHOTO_SIDE / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    canvas
      .getContext("2d")
      ?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob) throw new Error("file.failed");
    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A photo taken with the device's camera, or chosen where there is none. */
function PhotoPicker({
  young,
  pending,
  onDone,
}: {
  young: boolean;
  pending: boolean;
  onDone: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [taken, setTaken] = useState<{ file: File; url: string } | null>(null);
  useEffect(
    () => () => {
      if (taken) URL.revokeObjectURL(taken.url);
    },
    [taken],
  );
  const size = young ? "h-16 px-8 text-xl" : "h-11 px-5";
  return (
    <div className="grid justify-items-center gap-4">
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          try {
            const photo = await shrunk(file);
            setTaken({ file: photo, url: URL.createObjectURL(photo) });
          } catch {
            toast.error(m.photoFailed());
          }
        }}
      />
      {taken ? (
        <img
          src={taken.url}
          alt={m.photoYours()}
          className="max-h-96 w-auto max-w-full rounded-2xl border-2 object-contain"
        />
      ) : null}
      <div className="flex flex-wrap justify-center gap-3">
        <Button
          type="button"
          variant={taken ? "outline" : "default"}
          className={cn("rounded-full", size)}
          disabled={pending}
          onClick={() => input.current?.click()}
        >
          {taken ? (
            <RotateCcw aria-hidden className="size-6" />
          ) : (
            <Camera aria-hidden className="size-6" />
          )}
          {taken ? m.photoAgain() : m.photoTake()}
        </Button>
        {taken ? (
          <Button
            type="button"
            className={cn(
              "rounded-full bg-success text-white hover:bg-success/90",
              size,
            )}
            disabled={pending}
            onClick={() => onDone(taken.file)}
          >
            {pending ? (
              <LoaderCircle aria-hidden className="animate-spin" />
            ) : (
              <Check aria-hidden className="size-6" />
            )}
            {m.photoSend()}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A question answered with a drawing or a photo. The picture is stored
 * first, then answered with, as a spoken answer is; until the teacher marks
 * it the child may make another.
 */
export function PictureAnswer({
  block,
  view,
  driver,
  young,
  locked,
}: {
  block: Written;
  view: CheckView | undefined;
  driver: CheckDriver;
  young: boolean;
  locked: boolean;
}) {
  const media = useDocumentMedia();
  const [seen, setSeen] = useState<string | null>(null);
  const [again, setAgain] = useState(false);
  const send = useMutation({
    mutationFn: async (file: File) => {
      const kept = driver.keepFile
        ? await driver.keepFile(file)
        : { fileId: (await media.upload(file, "image")).fileId, url: null };
      await driver.respond(block.id, {
        type: "written",
        text: "",
        picture: { fileId: kept.fileId },
      });
      return kept.url;
    },
    onSuccess: (url) => {
      if (young) playSound("right");
      setSeen(url);
      setAgain(false);
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const stored =
    view?.response?.type === "written" && view.response.picture
      ? `/files/${view.response.picture.fileId}`
      : null;
  const sent = seen ?? stored;
  const drawn = block.answerWith === "drawing";

  if (sent && !again)
    return (
      <div className="grid justify-items-center gap-4">
        <StoredImage
          src={sent}
          alt={drawn ? m.drawYours() : m.photoYours()}
          removed={m.fileRemoved()}
          className="max-h-96 w-auto max-w-full rounded-2xl border-2 bg-white object-contain"
        />
        {locked ? null : (
          <Button
            type="button"
            variant="outline"
            className={cn(
              "rounded-full",
              young ? "h-16 px-8 text-xl" : "h-11 px-5",
            )}
            onClick={() => setAgain(true)}
          >
            {drawn ? (
              <Pencil aria-hidden className="size-6" />
            ) : (
              <Camera aria-hidden className="size-6" />
            )}
            {drawn ? m.drawAgain() : m.photoAgain()}
          </Button>
        )}
      </div>
    );
  if (locked) return null;
  return drawn ? (
    <DrawingPad
      young={young}
      pending={send.isPending}
      onDone={(file) => send.mutate(file)}
    />
  ) : (
    <PhotoPicker
      young={young}
      pending={send.isPending}
      onDone={(file) => send.mutate(file)}
    />
  );
}
