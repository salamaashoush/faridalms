export const embedProviders = [
  "youtube",
  "vimeo",
  "loom",
  "google-drive",
  "google-docs",
  "google-slides",
  "google-sheets",
  "google-forms",
  "canva",
  "geogebra",
  "desmos",
  "phet",
  "microsoft-365",
  "microsoft-forms",
] as const;
export type EmbedProvider = (typeof embedProviders)[number];

export interface Embed {
  provider: EmbedProvider;
  embedId: string;
}

const googleId = /^[\w-]{10,128}$/;

/**
 * Microsoft 365 frames a file from the school's own tenant, so its id keeps
 * the tenant's host and site with the file: `doc:` and `slides:` for Word,
 * Excel and PowerPoint, `video:` for Stream, `live:` for a personal OneDrive
 * file with its key, and `sway:` for a Sway. The address is rebuilt from
 * these, so nothing else a pasted link carries reaches the frame.
 */
const TENANT = "[a-z\\d][a-z\\d-]{0,62}\\.sharepoint\\.com";
const SITE = "(?:/(?:sites|teams|personal)/[\\w.%-]{1,128})?";
const GUID = "[\\da-f]{8}-[\\da-f]{4}-[\\da-f]{4}-[\\da-f]{4}-[\\da-f]{12}";
const microsoftId = new RegExp(
  `^(?:(?:doc|slides|video):${TENANT}${SITE}:${GUID}|live:[\\dA-F]{6,20}![\\d]{1,12}:![\\w-]{6,64}|sway:[\\dA-Za-z]{8,32})$`,
  "i",
);

const identifiers: Record<EmbedProvider, RegExp> = {
  youtube: /^[\w-]{11}$/,
  vimeo: /^\d{4,12}$/,
  loom: /^[\da-f]{32}$/,
  "google-drive": googleId,
  "google-docs": googleId,
  "google-slides": googleId,
  "google-sheets": googleId,
  "google-forms": /^[\w-]{10,160}$/,
  canva: /^[\w-]{8,24}\/[\w-]{8,48}$/,
  geogebra: /^[\da-z]{5,16}$/i,
  desmos: /^(?:calculator|geometry|3d)\/[\da-z]{6,32}$/,
  phet: /^[a-z\d]+(?:-[a-z\d]+)*$/,
  "microsoft-365": microsoftId,
  "microsoft-forms": /^(?:r\/[\w-]{6,20}|[\w-]{20,300})$/,
};

export function isEmbedId(provider: EmbedProvider, embedId: string): boolean {
  return identifiers[provider].test(embedId);
}

function parse(input: string): URL | null {
  try {
    const url = new URL(input.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function checked(provider: EmbedProvider, embedId: string | undefined) {
  return embedId && isEmbedId(provider, embedId) ? { provider, embedId } : null;
}

export function parseEmbedUrl(input: string): Embed | null {
  const url = parse(input);
  if (!url) return null;
  const host = url.hostname.replace(/^(www|m)\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  if (host === "youtu.be") return checked("youtube", parts[0]);
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (parts[0] === "watch")
      return checked("youtube", url.searchParams.get("v") ?? undefined);
    if (["embed", "shorts", "live"].includes(parts[0] ?? ""))
      return checked("youtube", parts[1]);
    return null;
  }
  if (host === "vimeo.com") return checked("vimeo", parts.at(-1));
  if (host === "player.vimeo.com" && parts[0] === "video")
    return checked("vimeo", parts[1]);
  if (host === "loom.com" && (parts[0] === "share" || parts[0] === "embed"))
    return checked("loom", parts[1]);
  if (host === "drive.google.com" && parts[0] === "file" && parts[1] === "d")
    return checked("google-drive", parts[2]);
  if (host === "docs.google.com") {
    const kind = parts[0];
    if (kind === "forms") {
      if (parts[1] === "d" && parts[2] === "e")
        return checked("google-forms", parts[3]);
      return null;
    }
    if (parts[1] !== "d") return null;
    if (kind === "document") return checked("google-docs", parts[2]);
    if (kind === "presentation") return checked("google-slides", parts[2]);
    if (kind === "spreadsheets") return checked("google-sheets", parts[2]);
    return null;
  }
  if (host === "canva.com" && parts[0] === "design")
    return checked(
      "canva",
      parts[1] && parts[2] ? `${parts[1]}/${parts[2]}` : undefined,
    );
  // A shared GeoGebra activity, or the address its Embed code frames.
  if (host === "geogebra.org") {
    if (
      ["m", "classic", "calculator", "graphing", "geometry", "3d"].includes(
        parts[0] ?? "",
      )
    )
      return checked("geogebra", parts[1]);
    if (parts[0] === "material" && parts[1] === "iframe" && parts[2] === "id")
      return checked("geogebra", parts[3]);
    return null;
  }
  if (host === "desmos.com" && parts[1])
    return checked("desmos", `${parts[0]}/${parts[1]}`);
  // A PhET simulation's page, or the simulation itself in any language.
  if (host === "phet.colorado.edu") {
    if (parts[1] === "simulations") return checked("phet", parts[2]);
    if (parts[0] === "sims" && parts[1] === "html")
      return checked("phet", parts[2]);
    return null;
  }
  return microsoftEmbed(url, host, parts);
}

/** What Word, Excel and PowerPoint for the web, Stream, OneDrive, Sway and Forms hand out to embed. */
function microsoftEmbed(url: URL, host: string, parts: string[]): Embed | null {
  const query = (name: string) =>
    [...url.searchParams].find(
      ([key]) => key.toLowerCase() === name.toLowerCase(),
    )?.[1] ?? "";
  if (host.endsWith(".sharepoint.com")) {
    const layouts = url.pathname.toLowerCase().indexOf("/_layouts/15/");
    if (layouts < 0) return null;
    const site = url.pathname.slice(0, layouts);
    const page = (parts.at(-1) ?? "").toLowerCase();
    const guid = (
      page === "embed.aspx" || page === "stream.aspx"
        ? query("UniqueId") || query("id")
        : query("sourcedoc")
    ).replaceAll(/[{}]/g, "");
    const kind =
      page === "embed.aspx" || page === "stream.aspx"
        ? "video"
        : page === "doc.aspx" || page.startsWith("wopiframe")
          ? query("wdAr")
            ? "slides"
            : "doc"
          : null;
    return kind
      ? checked("microsoft-365", `${kind}:${host}${site}:${guid.toLowerCase()}`)
      : null;
  }
  if (host === "onedrive.live.com" && parts[0] === "embed")
    return checked(
      "microsoft-365",
      `live:${query("resid")}:${query("authkey")}`,
    );
  if (host === "sway.office.com" || host === "sway.cloud.microsoft")
    return checked(
      "microsoft-365",
      `sway:${parts[0] === "s" ? parts[1] : parts[0]}`,
    );
  if (
    host === "forms.office.com" ||
    host === "forms.microsoft.com" ||
    host === "forms.cloud.microsoft"
  ) {
    if (parts[1]?.toLowerCase() === "responsepage.aspx")
      return checked("microsoft-forms", query("id"));
    if (parts[0] === "r" || parts[0] === "e")
      return checked("microsoft-forms", `r/${parts[1] ?? ""}`);
  }
  return null;
}

/** A Microsoft 365 id's kind and parts, as `microsoftId` lays them out. */
function microsoftParts(id: string) {
  const [kind = "", first = "", second = ""] = id.split(":");
  return { kind, first, second };
}

const IFRAME_SOURCE = /<iframe\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i;

/**
 * An embed from what a person pastes or types: a link, or the `<iframe>` code
 * a site hands out under Share then Embed, read through its source address.
 */
export function parseEmbedInput(input: string): Embed | null {
  const code = IFRAME_SOURCE.exec(input);
  return parseEmbedUrl(code?.[1] ? code[1].replaceAll("&amp;", "&") : input);
}

/** Whether a pasted text is embed code rather than words about it. */
export function isEmbedCode(input: string): boolean {
  const text = input.trim();
  return /^<iframe\b/i.test(text) && /<\/iframe>$|\/?>$/i.test(text);
}

const sources: Record<EmbedProvider, (id: string) => string> = {
  youtube: (id) => `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
  vimeo: (id) => `https://player.vimeo.com/video/${id}?dnt=1`,
  loom: (id) => `https://www.loom.com/embed/${id}`,
  "google-drive": (id) => `https://drive.google.com/file/d/${id}/preview`,
  "google-docs": (id) => `https://docs.google.com/document/d/${id}/preview`,
  "google-slides": (id) => `https://docs.google.com/presentation/d/${id}/embed`,
  "google-sheets": (id) =>
    `https://docs.google.com/spreadsheets/d/${id}/preview`,
  "google-forms": (id) =>
    `https://docs.google.com/forms/d/e/${id}/viewform?embedded=true`,
  canva: (id) => `https://www.canva.com/design/${id}/view?embed`,
  geogebra: (id) => `https://www.geogebra.org/material/iframe/id/${id}`,
  desmos: (id) => `https://www.desmos.com/${id}?embed`,
  phet: (id) =>
    `https://phet.colorado.edu/sims/html/${id}/latest/${id}_all.html`,
  "microsoft-365": (id) => {
    const { kind, first, second } = microsoftParts(id);
    if (kind === "live")
      return `https://onedrive.live.com/embed?resid=${encodeURIComponent(first)}&authkey=${encodeURIComponent(second)}&em=2`;
    if (kind === "sway") return `https://sway.cloud.microsoft/s/${first}/embed`;
    if (kind === "video")
      return `https://${first}/_layouts/15/embed.aspx?UniqueId=${second}`;
    return `https://${first}/_layouts/15/Doc.aspx?sourcedoc=%7B${second}%7D&action=embedview${kind === "slides" ? "&wdAr=1.7777777777777777" : ""}`;
  },
  "microsoft-forms": (id) =>
    id.startsWith("r/")
      ? `https://forms.office.com/${id}?embed=true`
      : `https://forms.office.com/Pages/ResponsePage.aspx?id=${id}&embed=true`,
};

const pages: Record<EmbedProvider, (id: string) => string> = {
  youtube: (id) => `https://www.youtube.com/watch?v=${id}`,
  vimeo: (id) => `https://vimeo.com/${id}`,
  loom: (id) => `https://www.loom.com/share/${id}`,
  "google-drive": (id) => `https://drive.google.com/file/d/${id}/view`,
  "google-docs": (id) => `https://docs.google.com/document/d/${id}/edit`,
  "google-slides": (id) => `https://docs.google.com/presentation/d/${id}/edit`,
  "google-sheets": (id) => `https://docs.google.com/spreadsheets/d/${id}/edit`,
  "google-forms": (id) => `https://docs.google.com/forms/d/e/${id}/viewform`,
  canva: (id) => `https://www.canva.com/design/${id}/view`,
  geogebra: (id) => `https://www.geogebra.org/m/${id}`,
  desmos: (id) => `https://www.desmos.com/${id}`,
  phet: (id) => `https://phet.colorado.edu/en/simulations/${id}`,
  "microsoft-365": (id) => {
    const { kind, first, second } = microsoftParts(id);
    if (kind === "live")
      return `https://onedrive.live.com/redir?resid=${encodeURIComponent(first)}&authkey=${encodeURIComponent(second)}`;
    if (kind === "sway") return `https://sway.cloud.microsoft/s/${first}`;
    if (kind === "video")
      return `https://${first}/_layouts/15/stream.aspx?UniqueId=${second}`;
    return `https://${first}/_layouts/15/Doc.aspx?sourcedoc=%7B${second}%7D&action=view`;
  },
  "microsoft-forms": (id) =>
    id.startsWith("r/")
      ? `https://forms.office.com/${id}`
      : `https://forms.office.com/Pages/ResponsePage.aspx?id=${id}`,
};

export function embedSource({ provider, embedId }: Embed): string {
  return sources[provider](embedId);
}

export function embedPage({ provider, embedId }: Embed): string {
  return pages[provider](embedId);
}

/** A YouTube or Vimeo video as watching counts it: its service and its id. */
export const framedKey = (provider: string, id: string) => `${provider}:${id}`;

/** A watched video's key that is a YouTube or Vimeo video's, not an upload's. */
export const FRAMED_KEY = /^(?:youtube:[\w-]{11}|vimeo:\d{4,12})$/;

export const embedProviderNames: Record<EmbedProvider, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  loom: "Loom",
  "google-drive": "Google Drive",
  "google-docs": "Google Docs",
  "google-slides": "Google Slides",
  "google-sheets": "Google Sheets",
  "google-forms": "Google Forms",
  canva: "Canva",
  geogebra: "GeoGebra",
  desmos: "Desmos",
  phet: "PhET",
  "microsoft-365": "Microsoft 365",
  "microsoft-forms": "Microsoft Forms",
};

export function embedAspect({ provider, embedId }: Embed): string {
  if (provider === "microsoft-365") {
    const { kind } = microsoftParts(embedId);
    return kind === "doc" || kind === "live" ? "4 / 3" : "16 / 9";
  }
  if (provider === "google-docs" || provider === "google-sheets")
    return "4 / 3";
  if (provider === "google-forms" || provider === "microsoft-forms")
    return "3 / 4";
  // Simulations and graphs are laid out for a classroom screen, not a film.
  if (provider === "geogebra" || provider === "desmos" || provider === "phet")
    return "4 / 3";
  return "16 / 9";
}
