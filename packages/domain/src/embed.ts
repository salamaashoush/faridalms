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
] as const;
export type EmbedProvider = (typeof embedProviders)[number];

export interface Embed {
  provider: EmbedProvider;
  embedId: string;
}

const googleId = /^[\w-]{10,128}$/;

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
  return null;
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
};

export function embedSource({ provider, embedId }: Embed): string {
  return sources[provider](embedId);
}

export function embedPage({ provider, embedId }: Embed): string {
  return pages[provider](embedId);
}

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
};

export function embedAspect(provider: EmbedProvider): string {
  if (provider === "google-docs" || provider === "google-sheets")
    return "4 / 3";
  if (provider === "google-forms") return "3 / 4";
  return "16 / 9";
}
