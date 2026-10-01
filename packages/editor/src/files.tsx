import type { FileDisplay } from "@faridalms/domain/content";
import type { FileFamily } from "@faridalms/domain/file";
import type { LucideIcon } from "lucide-react";

import { Dialog } from "@base-ui/react/dialog";
import { fileFamily, fileTypeLabel, previewable } from "@faridalms/domain/file";
import {
  Check,
  Download,
  File,
  FileArchive,
  FileImage,
  FileMusic,
  FileSpreadsheet,
  FileText,
  FileVideoCamera,
  Link,
  Presentation,
  X,
} from "lucide-react";
import { useState } from "react";

import type { EditorStrings } from "./strings";

import { formatBytes } from "./format";
import { MediaPlayer } from "./media-view";
import { cx } from "./ui";

const ICON: Record<FileFamily, LucideIcon> = {
  pdf: FileText,
  document: FileText,
  text: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  image: FileImage,
  audio: FileMusic,
  video: FileVideoCamera,
  archive: FileArchive,
  other: File,
};

/** What reading a file needs to say, shared by the editor and the reader. */
export type FileStrings = Pick<
  EditorStrings,
  | "downloadFile"
  | "openFile"
  | "copyFileLink"
  | "fileLinkCopied"
  | "closeViewer"
  | "noPreview"
  | "captions"
  | "picture"
>;

export interface FileFacts {
  name: string;
  mime: string;
  /** Unknown for pictures, whose blocks keep only the picture itself. */
  bytes?: number;
}

/** "PDF · 1.2 MB": what a reader weighs before opening a file on a slow line. */
export function fileMeta(file: FileFacts, locale: string): string {
  return [
    fileTypeLabel(file.name),
    file.bytes === undefined ? "" : formatBytes(file.bytes, locale),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A link anyone who may read the document can open; others are refused. */
function absolute(url: string): string {
  return new URL(url, window.location.href).href;
}

export function CopyLinkButton({
  url,
  strings,
  className,
}: {
  url: string;
  strings: FileStrings;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        void navigator.clipboard.writeText(absolute(url)).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className={className}
    >
      {copied ? <Check aria-hidden /> : <Link aria-hidden />}
      <span aria-live="polite">
        {copied ? strings.fileLinkCopied : strings.copyFileLink}
      </span>
    </button>
  );
}

/** Opens a file over the page: pages, pictures and players, or a download. */
export function FileViewer({
  file,
  url,
  open,
  onOpenChange,
  strings,
  locale,
}: {
  file: FileFacts;
  url: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  strings: FileStrings;
  locale: string;
}) {
  const family = fileFamily(file.name, file.mime);
  const Icon = ICON[family];
  const shown = previewable(file.mime);
  const action =
    "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium hover:bg-accent [&_svg]:size-4";
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Popup className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background outline-none sm:inset-6 sm:rounded-xl sm:border sm:shadow-2xl">
          <div className="flex min-h-14 items-center gap-3 border-b px-4">
            <Icon
              className="size-5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <Dialog.Title className="truncate text-sm font-semibold">
                <bdi>{file.name}</bdi>
              </Dialog.Title>
              <Dialog.Description className="text-xs text-muted-foreground">
                {fileMeta(file, locale)}
              </Dialog.Description>
            </div>
            <a href={`${url}?download`} download={file.name} className={action}>
              <Download aria-hidden />
              <span className="max-sm:sr-only">{strings.downloadFile}</span>
            </a>
            <CopyLinkButton
              url={url}
              strings={strings}
              className={cx(action, "max-sm:[&>span]:sr-only")}
            />
            <Dialog.Close
              aria-label={strings.closeViewer}
              className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent [&_svg]:size-4"
            >
              <X aria-hidden />
            </Dialog.Close>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/30">
            {!shown ? (
              <div className="grid max-w-sm justify-items-center gap-4 p-6 text-center">
                <Icon className="size-10 text-muted-foreground" aria-hidden />
                <p className="text-sm text-muted-foreground">
                  {strings.noPreview}
                </p>
                <a
                  href={`${url}?download`}
                  download={file.name}
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground [&_svg]:size-4"
                >
                  <Download aria-hidden />
                  {strings.downloadFile}
                </a>
              </div>
            ) : family === "image" ? (
              <img
                src={url}
                alt=""
                className="max-h-full max-w-full object-contain p-4"
              />
            ) : family === "audio" || family === "video" ? (
              <div className="w-full max-w-4xl p-4">
                <MediaPlayer
                  src={url}
                  captions={undefined}
                  video={family === "video"}
                  locale={locale}
                  captionsLabel={strings.captions}
                />
              </div>
            ) : (
              <object
                data={url}
                type={file.mime}
                aria-label={file.name}
                className="size-full bg-background"
              >
                <p className="p-6 text-sm text-muted-foreground">
                  {strings.noPreview}
                </p>
              </object>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * A file as it reads in a document: its kind, name, type and size on one
 * row, and its pages below when the author chose to show them. Readers open
 * it in the viewer; the author's click selects the block instead, so its
 * options appear in the floating bar.
 */
export function FileCard({
  file,
  url,
  display = "card",
  caption = "",
  strings,
  locale,
  editing = false,
  captionField,
}: {
  file: FileFacts;
  url: string | undefined;
  display?: FileDisplay;
  caption?: string;
  strings: FileStrings;
  locale: string;
  editing?: boolean;
  captionField?: React.ReactNode;
}) {
  const [viewing, setViewing] = useState(false);
  const family = fileFamily(file.name, file.mime);
  const Icon = ICON[family];
  const meta = fileMeta(file, locale);
  const label = `${file.name} (${meta})`;
  const pages = display === "preview" && family === "pdf" && url;
  const row = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-5">
        <Icon aria-hidden />
      </span>
      <span className="grid min-w-0 flex-1 text-start">
        <span className="truncate text-sm leading-5 font-medium">
          <bdi>{file.name}</bdi>
        </span>
        <span className="text-xs leading-4 text-muted-foreground">{meta}</span>
      </span>
    </>
  );
  const rowClass =
    "flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="flex items-center gap-1 p-1.5 pe-2">
        {editing || !url ? (
          <div className={rowClass}>{row}</div>
        ) : previewable(file.mime) ? (
          <button
            type="button"
            aria-label={`${strings.openFile}: ${label}`}
            onClick={() => setViewing(true)}
            className={cx(rowClass, "hover:bg-accent/60")}
          >
            {row}
          </button>
        ) : (
          <a
            href={`${url}?download`}
            download={file.name}
            aria-label={`${strings.downloadFile}: ${label}`}
            className={cx(rowClass, "hover:bg-accent/60")}
          >
            {row}
          </a>
        )}
        {url ? (
          <a
            href={`${url}?download`}
            download={file.name}
            aria-label={`${strings.downloadFile}: ${label}`}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-4"
          >
            <Download aria-hidden />
          </a>
        ) : null}
      </div>
      {pages ? (
        <object
          data={url}
          type="application/pdf"
          aria-label={file.name}
          className="block h-[min(70vh,640px)] w-full border-t bg-muted/30"
        >
          <p className="p-4 text-sm text-muted-foreground">
            {strings.noPreview}
          </p>
        </object>
      ) : null}
      {captionField ??
        (caption ? (
          <p
            dir="auto"
            className="border-t px-3 py-2 text-sm text-muted-foreground"
          >
            {caption}
          </p>
        ) : null)}
      {url ? (
        <FileViewer
          file={file}
          url={url}
          open={viewing}
          onOpenChange={setViewing}
          strings={strings}
          locale={locale}
        />
      ) : null}
    </div>
  );
}

/**
 * A picture as readers see it: a click opens it over the page, where it can
 * be seen whole, downloaded or linked.
 */
export function PictureView({
  src,
  alt,
  caption,
  className,
  strings,
  locale,
}: {
  src: string;
  alt: string;
  caption: string;
  className: string;
  strings: FileStrings;
  locale: string;
}) {
  const [open, setOpen] = useState(false);
  const name = caption || alt || strings.picture;
  return (
    <figure className={className}>
      <button
        type="button"
        aria-label={`${strings.openFile}: ${name}`}
        onClick={() => setOpen(true)}
        className="block w-full cursor-zoom-in rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="block h-auto w-full rounded-lg bg-muted"
        />
      </button>
      {caption ? (
        <figcaption className="mt-1.5 text-center text-sm text-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
      <FileViewer
        file={{ name, mime: "image/*" }}
        url={src}
        open={open}
        onOpenChange={setOpen}
        strings={strings}
        locale={locale}
      />
    </figure>
  );
}
