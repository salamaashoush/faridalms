import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@faridalms/ui/dialog";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import * as m from "~/i18n/messages";
import { initiateUpload } from "~/server/files";
import { changePhoto } from "~/server/students";
import { getMessageFromError } from "~/utils/error";
import { sendFile } from "~/utils/upload";

/** The square the picture is placed in, on screen. */
const VIEW = 256;
/** The photo as kept: enough for a big tile on a classroom screen. */
const KEPT = 512;

interface Placed {
  image: HTMLImageElement;
  url: string;
  zoom: number;
  x: number;
  y: number;
}

const coverOf = (image: HTMLImageElement) =>
  Math.max(VIEW / image.naturalWidth, VIEW / image.naturalHeight);

/** Keeps the picture covering the square, however it is moved or zoomed. */
function clamped(placed: Placed): Placed {
  const scale = coverOf(placed.image) * placed.zoom;
  const width = placed.image.naturalWidth * scale;
  const height = placed.image.naturalHeight * scale;
  return {
    ...placed,
    x: Math.min(0, Math.max(VIEW - width, placed.x)),
    y: Math.min(0, Math.max(VIEW - height, placed.y)),
  };
}

function choose(capture: boolean): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (capture) input.capture = "user";
    // Attached while open: Safari on iOS opens no chooser for a detached input.
    input.hidden = true;
    input.addEventListener("change", () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    input.addEventListener("cancel", () => {
      resolve(null);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

export interface PhotoDialogProps {
  personId: string;
  name: string;
  photoUrl: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (fileId: string | null) => void;
}

/**
 * Changes a person's photo: taken there and then or chosen from the device,
 * placed in the circle by dragging and zooming, and kept as a 512 pixel
 * JPEG. Drawing it afresh drops the camera's location and everything else
 * the original carried.
 */
export function PhotoDialog({
  personId,
  name,
  photoUrl,
  open,
  onOpenChange,
  onSaved,
}: PhotoDialogProps) {
  const initiate = useServerFn(initiateUpload);
  const change = useServerFn(changePhoto);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const shown = useRef<string | null>(null);

  const forget = () => {
    if (shown.current) URL.revokeObjectURL(shown.current);
    shown.current = null;
  };
  useEffect(
    () => () => {
      if (shown.current) URL.revokeObjectURL(shown.current);
    },
    [],
  );
  const openChange = (next: boolean) => {
    if (!next) {
      forget();
      setPlaced(null);
      setCamera(false);
    }
    onOpenChange(next);
  };

  const [camera, setCamera] = useState(false);
  const pick = async (capture: boolean) => {
    // A phone's own camera app is the better camera there; a computer
    // ignores the capture hint and would open the file chooser, so it gets
    // a live view in the dialog when it has a camera to give one.
    if (capture && liveCameraFits()) {
      setCamera(true);
      return;
    }
    const file = await choose(capture);
    if (file) place(file);
  };
  const place = (file: Blob) => {
    setCamera(false);
    forget();
    const url = URL.createObjectURL(file);
    shown.current = url;
    const image = new Image();
    image.addEventListener("load", () => {
      const scale = coverOf(image);
      setPlaced({
        image,
        url,
        zoom: 1,
        x: (VIEW - image.naturalWidth * scale) / 2,
        y: (VIEW - image.naturalHeight * scale) / 2,
      });
    });
    image.addEventListener("error", () => {
      forget();
      toast.error(m.photoUnreadable());
    });
    image.src = url;
  };

  const zoomTo = (zoom: number) =>
    setPlaced((current) => {
      if (!current) return current;
      // Zooming keeps the middle of the square on the same spot of the face.
      const ratio = zoom / current.zoom;
      const middle = VIEW / 2;
      return clamped({
        ...current,
        zoom,
        x: middle - (middle - current.x) * ratio,
        y: middle - (middle - current.y) * ratio,
      });
    });

  const move = (dx: number, dy: number) =>
    setPlaced((current) =>
      current
        ? clamped({ ...current, x: current.x + dx, y: current.y + dy })
        : current,
    );

  const save = useMutation({
    mutationFn: async () => {
      if (!placed) return null;
      const canvas = document.createElement("canvas");
      canvas.width = KEPT;
      canvas.height = KEPT;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("file.failed");
      const factor = KEPT / VIEW;
      const scale = coverOf(placed.image) * placed.zoom * factor;
      context.drawImage(
        placed.image,
        placed.x * factor,
        placed.y * factor,
        placed.image.naturalWidth * scale,
        placed.image.naturalHeight * scale,
      );
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.88),
      );
      if (!blob) throw new Error("file.failed");
      const file = new File([blob], "photo.jpg", { type: "image/jpeg" });
      const initiated = await initiate({
        data: {
          purpose: "avatar",
          name: file.name,
          mediaType: file.type,
          sizeBytes: file.size,
        },
      });
      await sendFile(`/files/${initiated.id}`, file, initiated.mediaType, {});
      await change({ data: { personId, fileId: initiated.id } });
      return initiated.id;
    },
    onSuccess: (fileId) => {
      toast.success(m.photoSaved());
      onSaved(fileId);
      openChange(false);
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });

  const remove = useMutation({
    mutationFn: () => change({ data: { personId, fileId: null } }),
    onSuccess: () => {
      toast.success(m.photoRemoved());
      onSaved(null);
      openChange(false);
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });

  const scale = placed ? coverOf(placed.image) * placed.zoom : 1;
  const busy = save.isPending || remove.isPending;
  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>{m.photoTitle({ name })}</DialogTitle>
        <DialogDescription>
          {placed ? m.photoPlaceHint() : m.photoChooseHint()}
        </DialogDescription>
        <div className="grid justify-items-center gap-4">
          {placed ? (
            <>
              <button
                type="button"
                aria-label={m.photoPlaced()}
                className="relative touch-none overflow-hidden rounded-lg bg-muted outline-none focus-visible:ring-4 focus-visible:ring-ring/50"
                style={{ width: VIEW, height: VIEW, cursor: "grab" }}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  drag.current = { x: event.clientX, y: event.clientY };
                }}
                onPointerMove={(event) => {
                  if (!drag.current) return;
                  move(
                    event.clientX - drag.current.x,
                    event.clientY - drag.current.y,
                  );
                  drag.current = { x: event.clientX, y: event.clientY };
                }}
                onPointerUp={() => {
                  drag.current = null;
                }}
                onKeyDown={(event) => {
                  const step = event.shiftKey ? 24 : 6;
                  const moves: Record<string, [number, number]> = {
                    ArrowLeft: [step, 0],
                    ArrowRight: [-step, 0],
                    ArrowUp: [0, step],
                    ArrowDown: [0, -step],
                  };
                  const delta = moves[event.key];
                  if (!delta) return;
                  event.preventDefault();
                  move(...delta);
                }}
              >
                <img
                  src={placed.url}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute max-w-none select-none"
                  style={{
                    left: placed.x,
                    top: placed.y,
                    width: placed.image.naturalWidth * scale,
                    height: placed.image.naturalHeight * scale,
                  }}
                />
                {/* What shows in the round photo everywhere else. */}
                <span className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgb(0_0_0/0.45)]" />
              </button>
              <label className="grid w-full gap-1 text-sm">
                {m.photoZoom()}
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={placed.zoom}
                  onChange={(event) => zoomTo(Number(event.target.value))}
                  className="w-full accent-primary"
                />
              </label>
            </>
          ) : camera ? (
            <LiveCamera
              onTaken={place}
              onCancel={() => setCamera(false)}
              onUnavailable={() => {
                setCamera(false);
                void choose(true).then((file) => {
                  if (file) place(file);
                });
              }}
            />
          ) : (
            <div
              className="grid place-items-center overflow-hidden rounded-lg bg-muted"
              style={{ width: VIEW, height: VIEW }}
            >
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt=""
                  className="size-48 rounded-full object-cover shadow-sm"
                />
              ) : (
                <span
                  aria-hidden
                  className="grid size-48 place-items-center rounded-full bg-background text-5xl font-semibold text-muted-foreground"
                >
                  {initialsOf(name)}
                </span>
              )}
            </div>
          )}
          <div
            className={cn("grid w-full grid-cols-2 gap-2", camera && "hidden")}
          >
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => void pick(true)}
            >
              <Camera aria-hidden />
              {m.photoTake()}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => void pick(false)}
            >
              <ImagePlus aria-hidden />
              {m.photoChoose()}
            </Button>
          </div>
        </div>
        {(photoUrl && !placed && !camera) || placed ? (
          <DialogFooter className="gap-2 sm:justify-between">
            {photoUrl && !placed ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                disabled={busy}
                onClick={() => remove.mutate()}
              >
                <Trash2 aria-hidden />
                {m.photoRemove()}
              </Button>
            ) : (
              <span />
            )}
            {placed ? (
              <Button
                type="button"
                disabled={busy}
                onClick={() => save.mutate()}
              >
                {save.isPending ? (
                  <LoaderCircle className="animate-spin" aria-hidden />
                ) : null}
                {m.photoSave()}
              </Button>
            ) : null}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Whether a live view is the way to take a photo here: a camera, and no phone camera app to hand it to. */
function liveCameraFits() {
  return (
    typeof navigator !== "undefined" &&
    // Absent outside a secure origin, whatever the types say.
    "mediaDevices" in navigator &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    !window.matchMedia("(pointer: coarse)").matches
  );
}

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

interface LiveCameraProps {
  onTaken: (photo: Blob) => void;
  onCancel: () => void;
  onUnavailable: () => void;
}

/**
 * The computer's camera, seen as a mirror in the square the photo is placed
 * in. The frame taken is turned the right way round, as the person sees
 * themselves once saved.
 */
function LiveCamera({ onTaken, onCancel, onUnavailable }: LiveCameraProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const fallBack = useRef(onUnavailable);
  useEffect(() => {
    fallBack.current = onUnavailable;
  });
  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 } },
        audio: false,
      })
      .then((opened) => {
        if (stopped) {
          for (const track of opened.getTracks()) track.stop();
          return;
        }
        stream = opened;
        if (video.current) video.current.srcObject = opened;
      })
      .catch(() => fallBack.current());
    return () => {
      stopped = true;
      for (const track of stream?.getTracks() ?? []) track.stop();
    };
  }, []);
  const take = () => {
    const frame = video.current;
    if (!frame?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = frame.videoWidth;
    canvas.height = frame.videoHeight;
    const draw = canvas.getContext("2d");
    if (!draw) return;
    draw.translate(canvas.width, 0);
    draw.scale(-1, 1);
    draw.drawImage(frame, 0, 0);
    canvas.toBlob((blob) => blob && onTaken(blob), "image/jpeg", 0.92);
  };
  return (
    <>
      <div
        className="relative overflow-hidden rounded-lg bg-muted"
        style={{ width: VIEW, height: VIEW }}
      >
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          onLoadedData={() => setReady(true)}
          className="size-full -scale-x-100 object-cover"
        />
        <span className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgb(0_0_0/0.45)]" />
        {ready ? null : (
          <LoaderCircle
            aria-hidden
            className="absolute inset-0 m-auto size-6 animate-spin text-muted-foreground"
          />
        )}
      </div>
      <div className="grid w-full grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {m.commonCancel()}
        </Button>
        <Button type="button" disabled={!ready} onClick={take}>
          <Camera aria-hidden />
          {m.photoCapture()}
        </Button>
      </div>
    </>
  );
}
