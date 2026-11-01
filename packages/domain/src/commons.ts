import * as v from "valibot";

/**
 * A picture's credit, as an open licence asks it be kept with the picture:
 * who made it, under which licence, and the page it came from. A teacher's
 * own photograph may name only who took it. Shown under the picture
 * wherever it is read, printed or exported.
 */
export interface PictureCredit {
  author: string;
  licence: string;
  licenceUrl?: string;
  /** The page the picture was taken from. */
  source?: string;
}

const httpsUrl = v.pipe(
  v.string(),
  v.maxLength(500),
  v.check((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }),
);

export const pictureCreditSchema = v.pipe(
  v.object({
    author: v.pipe(v.string(), v.maxLength(300)),
    licence: v.pipe(v.string(), v.maxLength(120)),
    licenceUrl: v.optional(httpsUrl),
    source: v.optional(httpsUrl),
  }),
  v.check(
    (credit) => Boolean(credit.author.trim() || credit.licence.trim()),
    "content.invalid",
  ),
);

/** Where a picture's subject sits, in percent, so any crop keeps it in view. */
export interface PictureFocus {
  x: number;
  y: number;
}

const percent = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100));

export const pictureFocusSchema = v.object({ x: percent, y: percent });

/**
 * A picture as every surface keeps it, a document's or a website's: the
 * file, the words for those who cannot see it unless it only decorates,
 * who made it, and where its subject sits.
 */
export interface Picture {
  fileId: string | null;
  alt: string;
  decorative?: boolean;
  credit?: PictureCredit;
  focus?: PictureFocus;
}

export const pictureEntries = {
  fileId: v.nullable(v.pipe(v.string(), v.uuid())),
  alt: v.pipe(v.string(), v.maxLength(300)),
  decorative: v.optional(v.boolean()),
  credit: v.optional(pictureCreditSchema),
  focus: v.optional(pictureFocusSchema),
};

/** Whether a shown picture still lacks the words a reader who cannot see it needs. */
export const pictureNeedsAlt = (picture: Picture) =>
  Boolean(picture.fileId) && !picture.decorative && !picture.alt.trim();

/** The site a credited picture came from, named as it names itself; none for a teacher's own. */
export function creditSource(credit: PictureCredit): string {
  if (!credit.source) return "";
  const host = new URL(credit.source).hostname;
  if (host.endsWith("commons.wikimedia.org")) return "Wikimedia Commons";
  if (host.endsWith(".wikipedia.org")) return "Wikipedia";
  return host;
}

/** A credit as one line of text: author, licence and source. */
export const creditText = (credit: PictureCredit) =>
  [credit.author, credit.licence, creditSource(credit)]
    .filter(Boolean)
    .join(" · ");

/** A file on Wikimedia Commons or a Wikipedia: the wiki to ask about it, and its title. */
export interface CommonsFile {
  api: string;
  title: string;
}

const WIKIPEDIA = /^([a-z][a-z-]{1,15})(?:\.m)?\.wikipedia\.org$/u;

const fileTitle = (name: string) => {
  try {
    return `File:${decodeURIComponent(name).replaceAll("_", " ")}`;
  } catch {
    return null;
  }
};

/**
 * The file a link points to: a Commons or Wikipedia file page, a picture
 * opened from an article (#/media/File:…), or the picture itself on
 * upload.wikimedia.org. Null for anything else.
 */
export function commonsFile(input: string): CommonsFile | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\./u, "");
  const commons = "https://commons.wikimedia.org/w/api.php";
  if (host === "upload.wikimedia.org") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "wikipedia") return null;
    // /wikipedia/commons/thumb/a/ab/Name.jpg/800px-Name.jpg names Name.jpg.
    const name = parts[2] === "thumb" ? parts[5] : parts[4];
    const title = name ? fileTitle(name) : null;
    const wiki = parts[1];
    if (!title || !wiki) return null;
    return {
      api:
        wiki === "commons"
          ? commons
          : `https://${wiki}.wikipedia.org/w/api.php`,
      title,
    };
  }
  const wikipedia = WIKIPEDIA.exec(host)?.[1];
  if (
    host !== "commons.wikimedia.org" &&
    host !== "commons.m.wikimedia.org" &&
    !wikipedia
  )
    return null;
  const api = wikipedia
    ? `https://${wikipedia}.wikipedia.org/w/api.php`
    : commons;
  const media = /^#\/media\/File:(.+)$/u.exec(url.hash)?.[1];
  const page = /^\/wiki\/File:(.+)$/u.exec(url.pathname)?.[1];
  const title = (media ?? page) ? fileTitle(media ?? page ?? "") : null;
  return title ? { api, title } : null;
}

/** The address that asks a wiki for a file's picture, at a size a lesson shows, and its credit. */
export function commonsInfoUrl(file: CommonsFile, language: string): string {
  const query = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    origin: "*",
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    iiurlwidth: "1600",
    iiextmetadatalanguage: language,
    iiextmetadatamultilang: "1",
    iiextmetadatafilter:
      "ImageDescription|ObjectName|Artist|LicenseShortName|LicenseUrl",
    titles: file.title,
  });
  return `${file.api}?${query.toString()}`;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Wiki metadata, which is HTML, as plain words. */
function plain(html: string): string {
  return html
    .replaceAll(/<br\s*\/?>|<\/(?:p|div|li|td|tr)>/giu, " ")
    .replaceAll(/<[^>]*>/gu, "")
    .replaceAll(/&(#x?[\da-f]+|[a-z]+);/giu, (whole, name: string) => {
      if (name.startsWith("#")) {
        const code =
          name[1]?.toLowerCase() === "x"
            ? Number.parseInt(name.slice(2), 16)
            : Number.parseInt(name.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
      }
      return ENTITIES[name.toLowerCase()] ?? whole;
    })
    .replaceAll(/\s+/gu, " ")
    .trim();
}

const field = v.optional(v.object({ value: v.unknown() }));

const infoSchema = v.object({
  query: v.object({
    pages: v.array(
      v.object({
        title: v.optional(v.string()),
        missing: v.optional(v.boolean()),
        imageinfo: v.optional(
          v.array(
            v.object({
              url: v.string(),
              thumburl: v.optional(v.string()),
              descriptionurl: v.string(),
              extmetadata: v.optional(
                v.object({
                  ImageDescription: field,
                  ObjectName: field,
                  Artist: field,
                  LicenseShortName: field,
                  LicenseUrl: field,
                }),
              ),
            }),
          ),
        ),
      }),
    ),
  }),
});

/** What the MediaWiki API names a field's one value among its languages. */
const WIKI_DEFAULT = "_default";

/**
 * A metadata field's words: in the reader's language or English where the
 * wiki has them in several, else its one value. A description only in some
 * third language says nothing a reader here can use, so it is left out.
 */
function text(entry: { value: unknown } | undefined, language: string): string {
  const value = entry?.value;
  if (typeof value === "string") return plain(value);
  if (!value || typeof value !== "object") return "";
  const byLanguage = value as Record<string, unknown>;
  const chosen =
    byLanguage[language] ?? byLanguage.en ?? byLanguage[WIKI_DEFAULT];
  return typeof chosen === "string" ? plain(chosen) : "";
}

const upto = (value: string, length: number) =>
  value.length <= length ? value : `${value.slice(0, length - 1)}…`;

/**
 * The picture a wiki's answer points to, with words to describe it and the
 * credit its licence asks for; null when the file is missing, is not on
 * Wikimedia's servers, or carries no licence to keep.
 */
export function commonsPicture(
  answer: unknown,
  language: string,
): { image: string; alt: string; credit: PictureCredit } | null {
  const parsed = v.safeParse(infoSchema, answer);
  if (!parsed.success) return null;
  const [page] = parsed.output.query.pages;
  const [info] = page?.imageinfo ?? [];
  if (!page || page.missing || !info) return null;
  const image = info.thumburl ?? info.url;
  // Wikimedia serves pictures, and their scaled copies, from these hosts alone.
  if (!/^https:\/\/(?:upload|thumb)\.wikimedia\.org\//u.test(image))
    return null;
  const meta = info.extmetadata;
  const licence = upto(text(meta?.LicenseShortName, language), 120);
  // A picture taken from Commons is kept only under a licence it names.
  if (!licence) return null;
  const licenceUrl = text(meta?.LicenseUrl, language);
  const credit = {
    author: upto(text(meta?.Artist, language), 300),
    licence,
    ...(licenceUrl.startsWith("https://") ? { licenceUrl } : {}),
    source: info.descriptionurl,
  };
  if (!v.is(pictureCreditSchema, credit)) return null;
  const named =
    text(meta?.ObjectName, language) ||
    (page.title ?? "").replace(/^File:|\.\w+$/gu, "");
  return {
    image,
    alt: upto(text(meta?.ImageDescription, language) || named, 300),
    credit,
  };
}
