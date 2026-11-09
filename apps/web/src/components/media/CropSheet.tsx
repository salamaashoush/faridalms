import type {
  CropRatio,
  CropView,
  PictureEdits,
  PictureTurn,
  PixelSize,
} from "@faridalms/domain/media";

import {
  CROP_RATIOS,
  cropRect,
  editedName,
  initialView,
  NO_EDITS,
  resizedTo,
  turnedFocus,
  turnedSize,
} from "@faridalms/domain/media";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { CropFrame } from "@faridalms/ui/system/crop-frame";
import { FormField } from "@faridalms/ui/system/form-field";
import { Segmented } from "@faridalms/ui/system/panel";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  FlipHorizontal2,
  FlipVertical2,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { uploadDocumentFile } from "~/hooks/useDocumentMedia";
import * as m from "~/i18n/messages";
import { initiateUpload } from "~/server/files";
import { cropMediaItem } from "~/server/media";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { MediaRow } from "./media-items";

const RATIO_LABEL: Record<CropRatio, () => string> = {
  original: m.mediaCropOriginal,
  free: m.mediaCropFree,
  "1:1": () => formatNumber(1) + ":" + formatNumber(1),
  "4:3": () => formatNumber(4) + ":" + formatNumber(3),
  "3:2": () => formatNumber(3) + ":" + formatNumber(2),
  "16:9": () => formatNumber(16) + ":" + formatNumber(9),
};

const percent = (share: number) => `${formatNumber(Math.round(share * 100))}%`;

/** What an edit is saved as: the picture's own kind, but a GIF, which a canvas cannot write, as PNG. */
function outputType(mediaType: string) {
  return ["image/jpeg", "image/png", "image/webp"].includes(mediaType)
    ? mediaType
    : "image/png";
}

/** A picture drawn mirrored and then turned, as the edit asks. */
function turned(
  image: HTMLImageElement,
  edits: PictureEdits,
): HTMLCanvasElement {
  const size = turnedSize(
    { width: image.naturalWidth, height: image.naturalHeight },
    edits.turn,
  );
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  context.translate(size.width / 2, size.height / 2);
  context.rotate((edits.turn * Math.PI) / 180);
  context.scale(edits.flipX ? -1 : 1, edits.flipY ? -1 : 1);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  return canvas;
}

/** The kept part of a picture, scaled to its width, drawn and written as a file. */
async function cut(
  source: CanvasImageSource,
  rect: { x: number; y: number; width: number; height: number },
  size: PixelSize,
  type: string,
  name: string,
): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (context) {
    context.imageSmoothingQuality = "high";
    context.drawImage(
      source,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      size.width,
      size.height,
    );
  }
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, 0.92),
  );
  if (!blob) throw new Error("file.failed");
  const named =
    type === "image/png" && !/\.png$/iu.test(name)
      ? `${name.replace(/\.\w+$/u, "")}.png`
      : name;
  return new File([blob], named, { type });
}

/** The picture as the frame shows it: the original, or turned and mirrored. */
interface Shown {
  url: string;
  source: CanvasImageSource;
  size: PixelSize;
}

export interface CropSheetProps {
  item: MediaRow;
  onClose: () => void;
  onCropped: () => Promise<unknown>;
}

/**
 * Crops a media picture to a shape, turns, mirrors or narrows it, kept as
 * a new item beside the original, which every document showing it goes on
 * showing whole. The frame starts on the picture's subject. The picture is
 * edited in the browser and uploaded like any other.
 */
export function CropSheet({ item, onClose, onCropped }: CropSheetProps) {
  const initiate = useServerFn(initiateUpload);
  const crop = useServerFn(cropMediaItem);
  const [original, setOriginal] = useState<HTMLImageElement | null>(null);
  const [turnedView, setTurnedView] = useState<
    (Shown & { edit: string }) | null
  >(null);
  const [failed, setFailed] = useState(false);
  const [ratio, setRatio] = useState<CropRatio>("original");
  const [edits, setEdits] = useState<PictureEdits>(NO_EDITS);
  const [view, setView] = useState<CropView>(
    initialView(item.focus ?? undefined),
  );

  // The picture is read once as bytes, so the canvas may draw it and the
  // frame shows the same pixels it cuts.
  useEffect(() => {
    let url: string | null = null;
    let current = true;
    fetch(`/files/${item.id}`)
      .then((response) => {
        if (!response.ok) throw new Error("file.failed");
        return response.blob();
      })
      .then(async (blob) => {
        url = URL.createObjectURL(blob);
        const image = new Image();
        image.src = url;
        await image.decode();
        if (current) setOriginal(image);
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [item.id]);

  // A turn or a mirror draws the picture again for the frame to show.
  const { turn, flipX, flipY } = edits;
  const edit = `${turn}:${flipX}:${flipY}`;
  const upright = turn === 0 && !flipX && !flipY;
  useEffect(() => {
    if (!original || upright) return undefined;
    const canvas = turned(original, { turn, flipX, flipY, width: null });
    let url: string | null = null;
    let current = true;
    canvas.toBlob((blob) => {
      if (!blob || !current) return;
      url = URL.createObjectURL(blob);
      setTurnedView({
        edit: `${turn}:${flipX}:${flipY}`,
        url,
        source: canvas,
        size: { width: canvas.width, height: canvas.height },
      });
    });
    return () => {
      current = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [original, upright, turn, flipX, flipY]);
  const shown: Shown | null = !original
    ? null
    : upright
      ? {
          url: original.src,
          source: original,
          size: {
            width: original.naturalWidth,
            height: original.naturalHeight,
          },
        }
      : turnedView?.edit === edit
        ? turnedView
        : null;

  const turnBy = (by: 90 | 270) => {
    const next = { ...edits, turn: ((edits.turn + by) % 360) as PictureTurn };
    setEdits(next);
    setView(
      initialView(item.focus ? turnedFocus(item.focus, next) : undefined),
    );
  };
  const flip = (axis: "flipX" | "flipY") => {
    const next = { ...edits, [axis]: !edits[axis] };
    setEdits(next);
    setView(
      initialView(item.focus ? turnedFocus(item.focus, next) : undefined),
    );
  };

  const rect = shown ? cropRect(shown.size, ratio, view) : null;
  // A width is kept only once it narrows the picture by a sensible amount.
  const kept: PictureEdits = {
    ...edits,
    width:
      rect &&
      edits.width !== null &&
      edits.width >= 16 &&
      edits.width < rect.width
        ? edits.width
        : null,
  };
  const size = rect ? resizedTo(rect, kept.width) : null;
  const cutAway =
    ratio !== "original" || view.scale < 1 || (view.scaleY ?? 1) < 1;
  const mutation = useMutation({
    mutationFn: async () => {
      if (!shown || !rect || !size) throw new Error("file.failed");
      const file = await cut(
        shown.source,
        rect,
        size,
        outputType(item.mediaType),
        editedName(item.name, ratio, cutAway),
      );
      const sent = await uploadDocumentFile(initiate, file, undefined);
      return crop({
        data: {
          sourceId: item.id,
          fileId: sent.fileId,
          ratio,
          cut: cutAway,
          edits: kept,
        },
      });
    },
  });
  return (
    <SheetForm
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={m.mediaCropTitle({ name: item.name })}
      submitLabel={m.mediaCropSave()}
      pending={mutation.isPending}
      error={
        failed
          ? m.mediaCropUnreadable()
          : mutation.error
            ? getMessageFromError(mutation.error)
            : null
      }
      status={
        size
          ? m.mediaCropSize({
              width: formatNumber(size.width),
              height: formatNumber(size.height),
            })
          : null
      }
      onSubmit={async () => {
        if (!rect) return;
        await mutation.mutateAsync().then(
          async () => {
            await onCropped();
            toast.success(m.mediaCropped());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {m.mediaCropHint()}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => turnBy(270)}>
          <RotateCcw aria-hidden />
          {m.mediaTurnLeft()}
        </Button>
        <Button type="button" variant="outline" onClick={() => turnBy(90)}>
          <RotateCw aria-hidden />
          {m.mediaTurnRight()}
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-pressed={edits.flipX}
          onClick={() => flip("flipX")}
        >
          <FlipHorizontal2 aria-hidden />
          {m.mediaFlipAcross()}
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-pressed={edits.flipY}
          onClick={() => flip("flipY")}
        >
          <FlipVertical2 aria-hidden />
          {m.mediaFlipDown()}
        </Button>
      </div>
      <div className="overflow-x-auto">
        <Segmented
          label={m.mediaCropShape()}
          value={ratio}
          options={CROP_RATIOS.map((value) => ({
            value,
            label: RATIO_LABEL[value](),
          }))}
          onChange={(next) => {
            setRatio(next);
            setView((before) => ({ ...before, scale: 1, scaleY: 1 }));
          }}
        />
      </div>
      {shown && rect ? (
        <CropFrame
          src={shown.url}
          label={m.mediaCropFrame()}
          frame={{
            x: rect.x / shown.size.width,
            y: rect.y / shown.size.height,
            width: rect.width / shown.size.width,
            height: rect.height / shown.size.height,
          }}
          onCenter={(centerX, centerY) =>
            setView((before) => ({ ...before, centerX, centerY }))
          }
        />
      ) : failed ? null : (
        <div aria-busy="true" className="aspect-[4/3] rounded-md bg-muted" />
      )}
      <FormField
        id="media-crop-size"
        label={ratio === "free" ? m.mediaCropWidth() : m.mediaCropScale()}
        hint={percent(view.scale)}
      >
        {(control) => (
          <input
            {...control}
            type="range"
            min={10}
            max={100}
            value={Math.round(view.scale * 100)}
            onChange={(event) =>
              setView((before) => ({
                ...before,
                scale: Number(event.target.value) / 100,
              }))
            }
            className="w-full accent-primary"
          />
        )}
      </FormField>
      {ratio === "free" ? (
        <FormField
          id="media-crop-height"
          label={m.mediaCropHeight()}
          hint={percent(view.scaleY ?? 1)}
        >
          {(control) => (
            <input
              {...control}
              type="range"
              min={10}
              max={100}
              value={Math.round((view.scaleY ?? 1) * 100)}
              onChange={(event) =>
                setView((before) => ({
                  ...before,
                  scaleY: Number(event.target.value) / 100,
                }))
              }
              className="w-full accent-primary"
            />
          )}
        </FormField>
      ) : null}
      {rect ? (
        <FormField
          id="media-resize-width"
          label={m.mediaResize()}
          hint={m.mediaResizeHint({ width: formatNumber(rect.width) })}
        >
          {(control) => (
            <Input
              {...control}
              type="number"
              inputMode="numeric"
              min={16}
              max={rect.width}
              value={edits.width ?? ""}
              placeholder={String(rect.width)}
              onChange={(event) => {
                const value = Math.round(Number(event.target.value));
                setEdits((before) => ({
                  ...before,
                  width:
                    event.target.value === "" || !Number.isFinite(value)
                      ? null
                      : value,
                }));
              }}
              className="w-32"
            />
          )}
        </FormField>
      ) : null}
    </SheetForm>
  );
}
