import type {
  CropRatio,
  CropView,
  PixelSize,
} from "@faridalms/domain/media-library";

import {
  CROP_RATIOS,
  croppedName,
  cropRect,
  initialView,
} from "@faridalms/domain/media-library";
import { CropFrame } from "@faridalms/ui/system/crop-frame";
import { FormField } from "@faridalms/ui/system/form-field";
import { Segmented } from "@faridalms/ui/system/panel";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { uploadDocumentFile } from "~/hooks/useDocumentMedia";
import * as m from "~/i18n/messages";
import { initiateUpload } from "~/server/files";
import { cropLibraryItem } from "~/server/media-library";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { LibraryRow } from "./library-items";

const RATIO_LABEL: Record<CropRatio, () => string> = {
  original: m.mediaCropOriginal,
  free: m.mediaCropFree,
  "1:1": () => formatNumber(1) + ":" + formatNumber(1),
  "4:3": () => formatNumber(4) + ":" + formatNumber(3),
  "3:2": () => formatNumber(3) + ":" + formatNumber(2),
  "16:9": () => formatNumber(16) + ":" + formatNumber(9),
};

const percent = (share: number) => `${formatNumber(Math.round(share * 100))}%`;

/** What a crop is saved as: the picture's own kind, but a GIF, which a canvas cannot write, as PNG. */
function outputType(mediaType: string) {
  return ["image/jpeg", "image/png", "image/webp"].includes(mediaType)
    ? mediaType
    : "image/png";
}

/** The kept part of a picture, drawn onto a canvas and written as a file. */
async function cut(
  image: HTMLImageElement,
  rect: { x: number; y: number; width: number; height: number },
  type: string,
  name: string,
): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = rect.width;
  canvas.height = rect.height;
  canvas
    .getContext("2d")
    ?.drawImage(
      image,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      rect.width,
      rect.height,
    );
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

export interface CropSheetProps {
  item: LibraryRow;
  onClose: () => void;
  onCropped: () => Promise<unknown>;
}

/**
 * Crops a library picture to a shape, kept as a new item beside the
 * original, which every document showing it goes on showing whole. The
 * picture is cut in the browser and uploaded like any other.
 */
export function CropSheet({ item, onClose, onCropped }: CropSheetProps) {
  const initiate = useServerFn(initiateUpload);
  const crop = useServerFn(cropLibraryItem);
  const [loaded, setLoaded] = useState<{
    url: string;
    image: HTMLImageElement;
    size: PixelSize;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const [ratio, setRatio] = useState<CropRatio>("original");
  const [view, setView] = useState<CropView>(initialView());

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
        if (current)
          setLoaded({
            url,
            image,
            size: { width: image.naturalWidth, height: image.naturalHeight },
          });
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [item.id]);

  const rect = loaded ? cropRect(loaded.size, ratio, view) : null;
  const mutation = useMutation({
    mutationFn: async () => {
      if (!loaded || !rect) throw new Error("file.failed");
      const file = await cut(
        loaded.image,
        rect,
        outputType(item.mediaType),
        croppedName(item.name, ratio),
      );
      const sent = await uploadDocumentFile(initiate, file, undefined);
      return crop({
        data: { sourceId: item.id, fileId: sent.fileId, ratio },
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
        rect
          ? m.mediaCropSize({
              width: formatNumber(rect.width),
              height: formatNumber(rect.height),
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
      {loaded && rect ? (
        <CropFrame
          src={loaded.url}
          label={m.mediaCropFrame()}
          frame={{
            x: rect.x / loaded.size.width,
            y: rect.y / loaded.size.height,
            width: rect.width / loaded.size.width,
            height: rect.height / loaded.size.height,
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
    </SheetForm>
  );
}
