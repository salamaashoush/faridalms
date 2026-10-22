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
  PaintBucket,
  Pencil,
  RotateCcw,
  Trash2,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useDocumentMedia } from "~/components/coursework/useDocumentMedia";
import * as m from "~/i18n/messages";
import { getMessageFromError } from "~/utils/error";
import { shrunkImage } from "~/utils/images";

import type { CheckDriver } from "./Checks";

import { fillMask } from "./fill";
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
  /** Takes away what was drawn, leaving the picture underneath. */
  erase?: boolean;
}

/** A tap that fills the area around it with a colour, as a paint bucket does. */
interface Fill {
  fill: true;
  colour: string;
  x: number;
  y: number;
}

type Mark = Stroke | Fill;

const isFill = (mark: Mark): mark is Fill => "fill" in mark;

function drawStroke(context: CanvasRenderingContext2D, stroke: Stroke) {
  const [x = 0, y = 0] = stroke.points;
  context.globalCompositeOperation = stroke.erase
    ? "destination-out"
    : "source-over";
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

/** The page as the child sees it: white, the teacher's picture, then what they drew. */
function compose(
  canvas: HTMLCanvasElement | null,
  picture: HTMLImageElement | null,
  layer: HTMLCanvasElement,
) {
  const context = canvas?.getContext("2d");
  if (!context) return;
  context.globalCompositeOperation = "source-over";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, WIDTH, HEIGHT);
  if (picture) {
    const scale = Math.min(
      WIDTH / picture.naturalWidth,
      HEIGHT / picture.naturalHeight,
    );
    const width = picture.naturalWidth * scale;
    const height = picture.naturalHeight * scale;
    context.drawImage(
      picture,
      (WIDTH - width) / 2,
      (HEIGHT - height) / 2,
      width,
      height,
    );
  }
  context.drawImage(layer, 0, 0);
}

/** Colours the area around a tap on the child's own layer, bounded by the page as it looks. */
function fillOn(
  canvas: HTMLCanvasElement,
  layer: HTMLCanvasElement,
  fill: Fill,
) {
  const page = canvas.getContext("2d")?.getImageData(0, 0, WIDTH, HEIGHT);
  const context = layer.getContext("2d");
  if (!page || !context) return;
  const mask = fillMask(page.data, WIDTH, HEIGHT, fill.x, fill.y);
  const drawn = context.getImageData(0, 0, WIDTH, HEIGHT);
  const red = Number.parseInt(fill.colour.slice(1, 3), 16);
  const green = Number.parseInt(fill.colour.slice(3, 5), 16);
  const blue = Number.parseInt(fill.colour.slice(5, 7), 16);
  for (let index = 0; index < mask.length; index += 1)
    if (mask[index]) drawn.data.set([red, green, blue, 255], index * 4);
  context.putImageData(drawn, 0, 0);
}

/** Draws every mark again on the child's layer, as undoing one needs. */
function redraw(
  canvas: HTMLCanvasElement | null,
  picture: HTMLImageElement | null,
  layer: HTMLCanvasElement,
  marks: readonly Mark[],
) {
  const context = layer.getContext("2d");
  if (!canvas || !context) return;
  context.globalCompositeOperation = "source-over";
  context.clearRect(0, 0, WIDTH, HEIGHT);
  for (const mark of marks)
    if (isFill(mark)) {
      // A fill finds its edges in the page as it looked when it was made.
      compose(canvas, picture, layer);
      fillOn(canvas, layer, mark);
    } else drawStroke(context, mark);
  compose(canvas, picture, layer);
}

/**
 * A page to draw on with a finger, a pen or a mouse: eight colours, a thin
 * and a thick pen, a paint bucket that fills an area, an eraser, undo, and
 * starting again, which takes a second tap so a slip never wipes a child's
 * picture. A teacher's picture under it makes it a colouring page: the
 * child draws and fills over it, and the eraser takes away only their own
 * marks.
 */
function DrawingPad({
  young,
  pending,
  background,
  onDone,
}: {
  young: boolean;
  pending: boolean;
  /** The picture drawn and coloured over, as a colouring page. */
  background?: { src: string; alt: string } | null;
  onDone: (file: File) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // The child's own marks, kept apart from the picture under them; made in
  // the browser once the page is there, as a server has no canvas.
  const layered = useRef<HTMLCanvasElement | null>(null);
  const layerOf = useCallback(() => {
    if (!layered.current) {
      const made = document.createElement("canvas");
      made.width = WIDTH;
      made.height = HEIGHT;
      layered.current = made;
    }
    return layered.current;
  }, []);
  const drawing = useRef<Stroke | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [picture, setPicture] = useState<HTMLImageElement | null>(null);
  const [colour, setColour] = useState(COLOURS[0]?.value ?? "#000000");
  const [width, setWidth] = useState(THICK);
  const [tool, setTool] = useState<"pen" | "fill" | "eraser">("pen");
  const [clearing, setClearing] = useState(false);

  const src = background?.src;
  useEffect(() => {
    if (!src) return undefined;
    let current = true;
    const image = new Image();
    // Pictures come from the files host, which shares them with any page;
    // asked for so, they leave the page readable for filling and saving.
    image.crossOrigin = "anonymous";
    image.src = src;
    image.decode().then(
      () => {
        if (current) setPicture(image);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [src]);
  useEffect(
    () => redraw(canvas.current, picture, layerOf(), marks),
    [picture, marks, layerOf],
  );
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
    const layer = layerOf();
    const context = layer.getContext("2d");
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
    compose(canvas.current, picture, layer);
  };

  const size = young ? "size-16" : "size-11";
  const pressed =
    "rounded-full aria-pressed:border-primary aria-pressed:bg-primary/10";
  return (
    <div className="grid gap-3">
      <p className="sr-only">
        {background?.alt
          ? m.drawOverPicture({ picture: background.alt })
          : m.drawHere()}
      </p>
      <canvas
        ref={canvas}
        width={WIDTH}
        height={HEIGHT}
        aria-hidden
        className="aspect-[4/3] w-[min(100%,calc(50dvh*4/3))] touch-none justify-self-center rounded-2xl border-2 bg-white shadow-sm"
        onPointerDown={(event) => {
          if (pending) return;
          const [x = 0, y = 0] = pointOf(event);
          if (tool === "fill") {
            setMarks((current) => [...current, { fill: true, colour, x, y }]);
            return;
          }
          event.currentTarget.setPointerCapture(event.pointerId);
          drawing.current = {
            colour,
            width: tool === "eraser" ? THICK * 2 : width,
            points: [x, y],
            ...(tool === "eraser" ? { erase: true } : {}),
          };
          const layer = layerOf();
          const context = layer.getContext("2d");
          if (context) drawStroke(context, drawing.current);
          compose(canvas.current, picture, layer);
        }}
        onPointerMove={extend}
        onPointerUp={() => {
          const done = drawing.current;
          drawing.current = null;
          if (done) setMarks((current) => [...current, done]);
        }}
        onPointerCancel={() => {
          drawing.current = null;
          redraw(canvas.current, picture, layerOf(), marks);
        }}
      />
      <div className="flex flex-wrap items-center justify-center gap-2">
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">{m.drawColours()}</legend>
          {COLOURS.map((item) => {
            const chosen = tool !== "eraser" && colour === item.value;
            return (
              <button
                key={item.value}
                type="button"
                aria-pressed={chosen}
                aria-label={item.name()}
                onClick={() => {
                  setColour(item.value);
                  if (tool === "eraser") setTool("pen");
                }}
                className={cn(
                  "grid touch-manipulation place-items-center rounded-full border-2 border-white shadow outline-none focus-visible:ring-4 focus-visible:ring-ring/50",
                  size,
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
              aria-pressed={tool === "pen" && width === pen.size}
              aria-label={pen.label}
              className={cn(size, pressed)}
              onClick={() => {
                setWidth(pen.size);
                setTool("pen");
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
            aria-pressed={tool === "fill"}
            aria-label={m.drawFill()}
            className={cn(size, pressed)}
            onClick={() => setTool("fill")}
          >
            <PaintBucket
              aria-hidden
              className="size-6"
              style={{ color: colour }}
            />
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-pressed={tool === "eraser"}
            aria-label={m.drawEraser()}
            className={cn(size, pressed)}
            onClick={() => setTool("eraser")}
          >
            <Eraser aria-hidden className="size-6" />
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label={m.drawUndo()}
            className={cn(size, "rounded-full")}
            disabled={marks.length === 0}
            onClick={() => setMarks((current) => current.slice(0, -1))}
          >
            <Undo2 aria-hidden className="size-6" />
          </Button>
          <Button
            type="button"
            variant={clearing ? "destructive" : "outline"}
            aria-label={clearing ? m.drawClearConfirm() : m.drawClear()}
            className={cn(size, "rounded-full")}
            disabled={marks.length === 0}
            onClick={() => {
              if (!clearing) {
                setClearing(true);
                return;
              }
              setClearing(false);
              setMarks([]);
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
            disabled={marks.length === 0 || pending}
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
            const photo = await shrunkImage(file, "photo.jpg", PHOTO_SIDE);
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
      background={
        block.picture
          ? { src: `/files/${block.picture.fileId}`, alt: block.picture.alt }
          : null
      }
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
