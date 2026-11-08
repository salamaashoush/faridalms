import { ImageUp, LoaderCircle, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { LibraryPicture } from "../context";

import { useEditorEnvironment } from "../context";

// The side a picked picture is drawn at: sharp on a tablet's screen at the
// largest a young child's card shows it, and small to store.
const SIDE = 512;

const KEPT_AS_IS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * A picked picture as a file to upload. A picture in a format the upload
 * check takes goes as it is; emoji arrive as SVG, which it refuses, so they
 * are drawn onto a canvas first; their sources allow it.
 */
export async function pictureFile(picture: LibraryPicture): Promise<File> {
  const response = await fetch(picture.full);
  if (!response.ok) throw new Error("file.failed");
  const blob = await response.blob();
  const kept = KEPT_AS_IS[blob.type];
  const stem =
    picture.source === "commons"
      ? picture.id.replace(/^File:/u, "").replace(/\.\w+$/u, "")
      : `${picture.source}-${picture.id}`;
  if (kept) return new File([blob], `${stem}.${kept}`, { type: blob.type });
  const name = `${stem}.png`;
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = SIDE;
    canvas.height = SIDE;
    canvas.getContext("2d")?.drawImage(image, 0, 0, SIDE, SIDE);
    const png = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!png) throw new Error("file.failed");
    return new File([png], name, { type: "image/png" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

type PictureStyle = "colour" | "lines";
type Collection = "symbols" | "commons";

export interface PictureLibraryProps {
  onPick: (picture: LibraryPicture) => Promise<void>;
  onUpload: () => void;
  onClose: () => void;
  /** For a colouring page: line drawings first, with the coloured ones a tap away. */
  colouring?: boolean;
  /**
   * Whether the place a picked picture goes keeps its credit, which a
   * picture from Wikimedia Commons must carry; only then is it offered.
   */
  credited?: boolean;
}

/**
 * Where a teacher finds a picture by what it shows, in the open sets the
 * school's editors offer, or uploads their own. A picked picture is copied
 * into the school, so a lesson never depends on the source staying up.
 */
export function PictureLibrary({
  onPick,
  onUpload,
  onClose,
  colouring = false,
  credited = false,
}: PictureLibraryProps) {
  const { strings, media } = useEditorEnvironment();
  const field = useId();
  const [query, setQuery] = useState("");
  const [style, setStyle] = useState<PictureStyle>(
    colouring ? "lines" : "colour",
  );
  const [collection, setCollection] = useState<Collection>("symbols");
  const [found, setFound] = useState<{
    query: string;
    style: PictureStyle;
    collection: Collection;
    pictures: LibraryPicture[];
  } | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const library = media?.pictures;
  const commons = credited && !colouring ? library?.commons : undefined;
  const input = useRef<HTMLInputElement>(null);
  // A panel opened to search starts with the caret in its box.
  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    const wanted = query.trim();
    if (!library || !wanted) return undefined;
    let current = true;
    const timer = setTimeout(() => {
      void library.search(wanted, style, collection).then(
        (pictures) => {
          if (current) setFound({ query: wanted, style, collection, pictures });
        },
        () => {
          if (current)
            setFound({ query: wanted, style, collection, pictures: [] });
        },
      );
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [library, query, style, collection]);

  const current = (value: typeof found) =>
    value?.style === style && value.collection === collection;
  const shown = query.trim() && current(found) ? (found?.pictures ?? []) : [];
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <label
          htmlFor={field}
          className="flex h-9 flex-1 items-center gap-2 rounded-md border bg-background px-2.5 focus-within:ring-2 focus-within:ring-ring/50 max-md:h-10"
        >
          <Search
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="sr-only">{strings.pictureSearch}</span>
          <input
            id={field}
            type="search"
            value={query}
            placeholder={strings.pictureSearch}
            autoComplete="off"
            ref={input}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button
          type="button"
          aria-label={strings.narrationClose}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground max-md:size-10"
          onClick={onClose}
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      {colouring ? (
        <fieldset className="grid grid-cols-2 gap-1 rounded-md bg-muted p-0.5">
          <legend className="sr-only">{strings.pictureStyle}</legend>
          {(["lines", "colour"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={style === value}
              onClick={() => setStyle(value)}
              className="h-7 rounded px-2 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm max-md:h-10"
            >
              {value === "lines" ? strings.pictureLines : strings.pictureColour}
            </button>
          ))}
        </fieldset>
      ) : null}
      {commons ? (
        <fieldset className="grid grid-cols-2 gap-1 rounded-md bg-muted p-0.5">
          <legend className="sr-only">{strings.pictureCollection}</legend>
          {(["symbols", "commons"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={collection === value}
              onClick={() => setCollection(value)}
              className="h-7 rounded px-2 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm max-md:h-10"
            >
              {value === "symbols"
                ? strings.pictureSymbols
                : strings.pictureCommons}
            </button>
          ))}
        </fieldset>
      ) : null}
      {shown.length > 0 ? (
        <ul className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
          {shown.map((picture) => {
            const key = `${picture.source}:${picture.id}`;
            return (
              <li key={key}>
                <button
                  type="button"
                  title={picture.label}
                  aria-label={picture.label}
                  disabled={picking !== null}
                  className="relative grid aspect-square w-full place-items-center rounded-md border bg-white p-1 outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
                  onClick={() => {
                    setPicking(key);
                    setFailed(false);
                    onPick(picture).then(
                      () => setPicking(null),
                      () => {
                        setPicking(null);
                        setFailed(true);
                      },
                    );
                  }}
                >
                  <img
                    src={picture.thumb}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    className="size-full object-contain"
                  />
                  {picking === key ? (
                    <LoaderCircle
                      aria-hidden
                      className="absolute size-5 animate-spin text-primary"
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : query.trim() && found?.query === query.trim() && current(found) ? (
        <p className="text-sm text-muted-foreground">{strings.pictureNone}</p>
      ) : null}
      {failed ? (
        <p role="alert" className="text-xs text-destructive">
          {strings.uploadFailed}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 max-md:h-10 [&_svg]:size-4"
          onClick={onUpload}
        >
          <ImageUp aria-hidden />
          {strings.pictureUpload}
        </button>
      </div>
      {library ? (
        <p className="text-[11px] leading-4 text-muted-foreground">
          {collection === "commons" && commons
            ? commons.credits
            : library.credits}
        </p>
      ) : null}
    </div>
  );
}
