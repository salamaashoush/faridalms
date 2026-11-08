import type { PictureCredit } from "@faridalms/domain/commons";
import type { FileDisplay } from "@faridalms/domain/content";
import type { FileFamily } from "@faridalms/domain/file";
import type { LucideIcon } from "lucide-react";
import type { ImgHTMLAttributes } from "react";

import { Dialog } from "@base-ui/react/dialog";
import { fileFamily, fileTypeLabel, previewable } from "@faridalms/domain/file";
import { placeholderUrl } from "@faridalms/domain/previews";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  File,
  FileArchive,
  ImageOff,
  FileImage,
  FileMusic,
  FileSpreadsheet,
  FileText,
  FileVideoCamera,
  Link,
  Presentation,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type { EditorStrings } from "./strings";

import { usePicture } from "./file-facts";
import { formatBytes, mediaClock } from "./format";
import { MediaPlayer } from "./media-view";
import { PictureCreditLine } from "./picture-credit";
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

/** What a stored picture is, beyond an image element's own attributes. */
export interface StoredImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  removed: string;
  /** The picture's file, which its sizes, size and placeholder are found by. */
  fileId?: string | undefined;
  /**
   * Its box is shaped by its class, as a gallery's tiles are; any other
   * takes the picture's own shape before it loads, so nothing below jumps.
   */
  framed?: boolean;
}

/**
 * A stored picture, or a note in its place when it cannot be had: deleted
 * from its file area, or never readable by this reader. A picture that
 * failed before the page came alive is caught when it mounts, since its
 * error event has already gone. Where the host serves its sizes the
 * browser fetches the one the layout needs, and where its size and
 * placeholder are known it holds its place, blurred, until it arrives.
 */
export function StoredImage({
  removed,
  alt,
  className,
  fileId,
  framed = false,
  sizes,
  style,
  onLoad,
  ...props
}: StoredImageProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const picture = usePicture(fileId);
  const checked = useCallback((image: HTMLImageElement | null) => {
    if (!image?.complete || !image.currentSrc) return;
    if (image.naturalWidth === 0) setFailed(true);
    else setLoaded(true);
  }, []);
  if (failed)
    return (
      <span className="flex min-h-24 w-full items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/40 px-4 py-6 text-sm text-muted-foreground [&_svg]:size-4">
        <ImageOff aria-hidden />
        {removed}
      </span>
    );
  const placeholder = loaded ? null : placeholderUrl(picture.placeholder);
  const sized = Boolean(picture.srcSet ?? picture.sources?.length);
  const shape =
    picture.width && picture.height && !framed
      ? { aspectRatio: `${picture.width} / ${picture.height}` }
      : {};
  const image = (
    <img
      ref={checked}
      alt={alt}
      onError={() => setFailed(true)}
      onLoad={(event) => {
        setLoaded(true);
        onLoad?.(event);
      }}
      className={className}
      srcSet={picture.srcSet}
      sizes={sized ? (sizes ?? "100vw") : undefined}
      style={{
        ...shape,
        ...(placeholder
          ? { backgroundImage: `url(${placeholder})`, backgroundSize: "cover" }
          : {}),
        ...style,
      }}
      {...props}
    />
  );
  return picture.sources?.length ? (
    <picture className="contents">
      {picture.sources.map((source) => (
        <source
          key={source.type}
          type={source.type}
          srcSet={source.srcSet}
          sizes={sizes ?? "100vw"}
        />
      ))}
      {image}
    </picture>
  ) : (
    image
  );
}

export function FileIcon({
  file,
  className,
}: {
  file: FileFacts;
  className?: string;
}) {
  const Icon = ICON[fileFamily(file.name, file.mime)];
  return <Icon aria-hidden className={className} />;
}

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
  | "transcript"
  | "transcriptSearch"
  | "transcriptNoMatch"
  | "chapters"
  | "descriptions"
  | "picture"
  | "fileRemoved"
  | "previousPicture"
  | "nextPicture"
  | "pictureOf"
>;

/**
 * A gallery's place in the viewer: which picture of how many, what it
 * shows, and a way to the one before or after.
 */
export interface ViewerSteps {
  at: number;
  total: number;
  alt: string;
  caption: string;
  onStep: (by: -1 | 1) => void;
}

/** How far a finger travels across a picture before it counts as a swipe. */
const SWIPE = 48;

/** Next lies the way the page reads: leftwards in Arabic. */
const forward = (element: Element) =>
  getComputedStyle(element).direction === "rtl" ? -1 : 1;

export interface FileFacts {
  name: string;
  mime: string;
  /** Unknown for pictures, whose blocks keep only the picture itself. */
  bytes?: number;
  /** What the media service found and made, once it has. */
  width?: number;
  height?: number;
  placeholder?: string;
  focus?: { x: number; y: number } | null;
  durationMs?: number;
  /** A recording's loudness in spans, each 0 to 100. */
  waveform?: number[];
  /** Its first page can be shown as a picture. */
  page?: boolean;
  /** An office file can be read as a PDF. */
  pdf?: boolean;
}

/** "PDF · 1.2 MB": what a reader weighs before opening a file on a slow line. */
export function fileMeta(file: FileFacts, locale: string): string {
  return [
    fileTypeLabel(file.name),
    file.durationMs ? mediaClock(file.durationMs / 1000) : "",
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

/**
 * Opens a file over the page: pages, pictures and players, or a download.
 * A gallery's picture steps to the one before or after it by its buttons,
 * the arrow keys or a swipe, each the way the page reads.
 */
export function FileViewer({
  file,
  url,
  open,
  onOpenChange,
  strings,
  locale,
  steps,
}: {
  file: FileFacts;
  url: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  strings: FileStrings;
  locale: string;
  steps?: ViewerSteps;
}) {
  const family = fileFamily(file.name, file.mime);
  const Icon = ICON[family];
  const pressed = useRef<number | null>(null);
  const popup = useRef<HTMLDivElement>(null);
  const step = useCallback(
    (by: -1 | 1) => {
      if (!steps) return;
      const to = steps.at + by;
      if (to >= 0 && to < steps.total) steps.onStep(by);
    },
    [steps],
  );
  // Arrow keys step wherever focus is, as a step to the last picture
  // disables the button that held it; caught first, before the dialog's
  // own parts can keep them.
  useEffect(() => {
    if (!open || !steps) return undefined;
    const press = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const sign = event.key === "ArrowRight" ? 1 : -1;
      step(
        (sign * forward(popup.current ?? document.documentElement)) as -1 | 1,
      );
    };
    document.addEventListener("keydown", press, true);
    return () => document.removeEventListener("keydown", press, true);
  }, [open, steps, step]);
  const stepButton =
    "absolute top-1/2 z-10 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full border bg-background/90 shadow-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-0 [&_svg]:size-5";
  // An office file the media service turned into a PDF shows as that PDF.
  const asPdf = !previewable(file.mime) && file.pdf === true;
  const shown = previewable(file.mime) || asPdf;
  const action =
    "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium hover:bg-accent [&_svg]:size-4";
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Popup
          ref={popup}
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background outline-none sm:inset-6 sm:rounded-xl sm:border sm:shadow-2xl"
        >
          <div className="flex min-h-14 items-center gap-3 border-b px-4">
            <Icon
              className="size-5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <Dialog.Title className="truncate text-sm font-semibold">
                <bdi>{file.name}</bdi>
              </Dialog.Title>
              <Dialog.Description
                className="text-xs text-muted-foreground"
                aria-live={steps ? "polite" : undefined}
              >
                {steps
                  ? strings.pictureOf(steps.at + 1, steps.total)
                  : fileMeta(file, locale)}
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
            ) : family === "image" && steps ? (
              <figure
                className="relative flex size-full min-h-0 touch-pan-y flex-col items-center justify-center gap-2 p-4"
                onPointerDown={(event) => {
                  pressed.current = event.clientX;
                }}
                onPointerUp={(event) => {
                  const from = pressed.current;
                  pressed.current = null;
                  if (from === null) return;
                  const moved = event.clientX - from;
                  if (Math.abs(moved) < SWIPE) return;
                  // A finger drawn against the reading way brings the next.
                  const sign = moved < 0 ? 1 : -1;
                  step((sign * forward(event.currentTarget)) as -1 | 1);
                }}
              >
                <img
                  src={url}
                  alt={steps.alt}
                  draggable={false}
                  className="min-h-0 max-w-full flex-1 object-contain select-none"
                />
                {steps.caption ? (
                  <figcaption
                    dir="auto"
                    className="text-center text-sm text-muted-foreground"
                  >
                    {steps.caption}
                  </figcaption>
                ) : null}
                <button
                  type="button"
                  aria-label={strings.previousPicture}
                  disabled={steps.at === 0}
                  onClick={() => step(-1)}
                  className={cx(stepButton, "start-3")}
                >
                  <ChevronLeft aria-hidden className="rtl:rotate-180" />
                </button>
                <button
                  type="button"
                  aria-label={strings.nextPicture}
                  disabled={steps.at === steps.total - 1}
                  onClick={() => step(1)}
                  className={cx(stepButton, "end-3")}
                >
                  <ChevronRight aria-hidden className="rtl:rotate-180" />
                </button>
              </figure>
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
                data={asPdf ? `${url}?as=pdf` : url}
                type={asPdf ? "application/pdf" : file.mime}
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

const noChange = () => () => {};
// Older Safari has no flag, and shows pages.
const pdfViewer = () =>
  "pdfViewerEnabled" in navigator ? navigator.pdfViewerEnabled : true;
const assumeViewer = () => true;

/** Whether this browser shows a PDF's pages itself; the server assumes so. */
const usePdfViewer = () =>
  useSyncExternalStore(noChange, pdfViewer, assumeViewer);

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
  actions,
}: {
  file: FileFacts;
  url: string | undefined;
  display?: FileDisplay;
  caption?: string;
  strings: FileStrings;
  locale: string;
  editing?: boolean;
  captionField?: React.ReactNode;
  /** Further buttons for this file, such as removing it from a list. */
  actions?: React.ReactNode;
}) {
  const [viewing, setViewing] = useState(false);
  const family = fileFamily(file.name, file.mime);
  const Icon = ICON[family];
  const meta = fileMeta(file, locale);
  const label = `${file.name} (${meta})`;
  const viewer = usePdfViewer();
  const [unread, setUnread] = useState(false);
  // An <object> that cannot show its file draws its fallback at the full
  // height of the pages, so a failed load or a browser without a viewer
  // gets a line of words instead.
  const watch = useCallback((element: HTMLObjectElement | null) => {
    if (!element) return undefined;
    const failed = () => setUnread(true);
    element.addEventListener("error", failed);
    return () => element.removeEventListener("error", failed);
  }, []);
  const asPdf = !previewable(file.mime) && file.pdf === true;
  const pages =
    display === "preview" && (family === "pdf" || asPdf) && url
      ? asPdf
        ? `${url}?as=pdf`
        : url
      : null;
  const row = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground [&_svg]:size-5">
        {file.page && url ? (
          <img
            src={`${url}?page=1&w=320`}
            alt=""
            loading="lazy"
            className="size-full object-cover object-top"
          />
        ) : (
          <Icon aria-hidden />
        )}
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
        ) : previewable(file.mime) || asPdf ? (
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
        {actions}
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
      {pages && viewer && !unread ? (
        <object
          ref={watch}
          data={pages}
          type="application/pdf"
          aria-label={file.name}
          className="block h-[min(70vh,640px)] w-full border-t bg-muted/30"
        >
          <p className="p-4 text-sm text-muted-foreground">
            {strings.noPreview}
          </p>
        </object>
      ) : pages ? (
        <p className="border-t px-3 py-2 text-sm text-muted-foreground">
          {strings.noPreview}
        </p>
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
  cover = false,
  credit,
  onOpen,
  fileId,
  sizes,
}: {
  src: string;
  /** The picture's file, for its sizes and placeholder. */
  fileId?: string | undefined;
  /** How wide the picture is drawn, as an `<img>`'s `sizes` says it. */
  sizes?: string | undefined;
  alt: string;
  caption: string;
  className: string;
  strings: FileStrings;
  locale: string;
  /** Cropped to one shape, as a gallery's pictures line up. */
  cover?: boolean;
  credit?: PictureCredit | undefined;
  /** Opens the picture in a viewer the caller keeps, as a gallery does. */
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const name = caption || alt || strings.picture;
  return (
    <figure className={className}>
      <button
        type="button"
        aria-label={`${strings.openFile}: ${name}`}
        onClick={() => (onOpen ? onOpen() : setOpen(true))}
        className="block w-full cursor-zoom-in rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <StoredImage
          src={src}
          fileId={fileId}
          sizes={sizes}
          framed={cover}
          alt={alt}
          loading="lazy"
          removed={strings.fileRemoved}
          className={
            cover
              ? "block aspect-[4/3] w-full rounded-lg bg-muted object-cover"
              : "block h-auto w-full rounded-lg bg-muted"
          }
        />
      </button>
      {caption ? (
        <figcaption className="mt-1.5 text-center text-sm text-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
      {credit ? <PictureCreditLine credit={credit} /> : null}
      {onOpen ? null : (
        <FileViewer
          file={{ name, mime: "image/*" }}
          url={src}
          open={open}
          onOpenChange={setOpen}
          strings={strings}
          locale={locale}
        />
      )}
    </figure>
  );
}
