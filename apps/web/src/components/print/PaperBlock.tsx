import type { ContentNode } from "@faridalms/domain/content";
import type { ReactNode } from "react";

import { parseChapters } from "@faridalms/domain/chapters";
import { embedPage, embedProviderNames } from "@faridalms/domain/embed";
import { fileMeta, StoredImage } from "@faridalms/editor/files";
import { blockAlignClass, mediaClock } from "@faridalms/editor/format";
import { cn } from "@faridalms/ui/cn";
import { useEffect, useState } from "react";

import type { Locale } from "~/i18n/runtime";

import { QrCode } from "~/components/badges/QrCode";
import * as m from "~/i18n/messages";

/** What a block's paper form reads from the paper it is on. */
export interface PaperFacts {
  locale: Locale;
  fileUrl: (fileId: string) => string;
  /** The document's own address, for the codes on what only plays online. */
  online: string | undefined;
  /** Whether recordings print what they say. */
  transcripts: boolean;
}

/**
 * A picture's width across the page. The reader's sizes follow the screen
 * and would differ between a phone's preview and the paper it prints, so
 * paper keeps sizes of its own.
 */
const WIDTH = {
  small: "w-1/3",
  medium: "w-1/2",
  large: "w-3/4",
  full: "w-full",
} as const;

/** An address as someone would type it: no scheme, no trailing slash. */
export function typedAddress(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

const dayOf = (date: string, locale: Locale) =>
  new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

/** The longest address worth printing; nobody types more from paper. */
const TYPED = 60;

/** A frame of a video, left out when it cannot be had or the card is narrow. */
function Still({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? null : (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      className="hidden h-[2.5cm] w-auto shrink-0 rounded-[3px] border border-neutral-300 object-cover @min-[11cm]:block"
    />
  );
}

/**
 * Something paper cannot play or open, with the code that opens it: its
 * kind, its name, and what scanning does.
 */
export function PaperOnline({
  kind,
  title,
  hint,
  link,
  address,
  still,
  children,
}: {
  kind: string;
  title: string | undefined;
  hint: string;
  link: string | undefined;
  /** An address short enough to type, for a reader without a camera. */
  address?: string | undefined;
  /** A frame of the video, which tells one recording from another. */
  still?: string | null | undefined;
  children?: ReactNode;
}) {
  return (
    <div className="paper-question @container my-[0.5em] grid gap-[0.6em] rounded-[4px] border border-neutral-400 p-[0.7em]">
      <div className="flex items-center gap-[0.9em]">
        {link ? (
          <QrCode value={link} className="size-[2.5cm] shrink-0" />
        ) : null}
        <div className="grid min-w-0 flex-1 gap-[0.15em]">
          <p className="text-[0.75em] leading-snug font-semibold text-neutral-600">
            {kind}
          </p>
          {title ? (
            <p className="leading-snug font-semibold">
              <bdi>{title}</bdi>
            </p>
          ) : null}
          {link ? (
            <p className="text-[0.85em] leading-snug text-neutral-600">
              {hint}
            </p>
          ) : null}
          {address ? (
            <p
              dir="ltr"
              className="text-[0.75em] leading-snug [overflow-wrap:anywhere] text-neutral-600 rtl:text-right"
            >
              {address}
            </p>
          ) : null}
        </div>
        {still ? <Still src={still} /> : null}
      </div>
      {children}
    </div>
  );
}

/**
 * A video's still frame, once the media service has made one. While the
 * answer is on its way the block says so, and printing waits for it.
 */
function useStill(src: string, video: boolean) {
  const [still, setStill] = useState<string | null | undefined>(
    video ? undefined : null,
  );
  useEffect(() => {
    if (!video) return undefined;
    let cancelled = false;
    fetch(`${src}/stream`)
      .then((response) => (response.ok ? response.json() : null))
      .then((found: { master?: string | null; poster?: string } | null) => {
        if (!cancelled) setStill(found?.master ? (found.poster ?? null) : null);
      })
      .catch(() => {
        if (!cancelled) setStill(null);
      });
    return () => {
      cancelled = true;
    };
  }, [src, video]);
  return still;
}

function PaperRecording({
  node,
  paper,
}: {
  node: ContentNode;
  paper: PaperFacts;
}) {
  const { locale } = paper;
  const video = (node.mime ?? "").startsWith("video/");
  const still = useStill(paper.fileUrl(node.fileId ?? ""), video);
  const chapters = parseChapters(node.chapters ?? "");
  const transcript = paper.transcripts ? (node.transcript ?? "").trim() : "";
  return (
    <div data-paper-wait={still === undefined ? "" : undefined}>
      <PaperOnline
        kind={(video ? m.printVideo : m.printSound)({}, { locale })}
        title={node.caption || node.name}
        hint={(video ? m.printScanToWatch : m.printScanToListen)(
          {},
          { locale },
        )}
        link={paper.online}
        still={still}
      >
        {chapters.length > 0 ? (
          <ol className="grid gap-[0.1em] text-[0.85em]">
            {chapters.map((chapter) => (
              <li key={chapter.at} className="flex gap-[0.8em]">
                <span dir="ltr" className="w-[3em] shrink-0 text-neutral-600">
                  {mediaClock(chapter.at)}
                </span>
                <span dir="auto">{chapter.title}</span>
              </li>
            ))}
          </ol>
        ) : null}
        {transcript ? (
          <div className="grid gap-[0.2em] border-t border-neutral-300 pt-[0.5em] text-[0.85em]">
            <p className="font-semibold text-neutral-600">
              {m.editorTranscript({}, { locale })}
            </p>
            <p dir="auto" className="whitespace-pre-wrap">
              {transcript}
            </p>
          </div>
        ) : null}
      </PaperOnline>
    </div>
  );
}

function PaperPicture({
  node,
  paper,
}: {
  node: ContentNode;
  paper: PaperFacts;
}) {
  const diagram = node.type === "diagram";
  return (
    <figure
      className={cn(
        "my-[0.6em]",
        WIDTH[node.size ?? "large"],
        blockAlignClass(node.format),
      )}
    >
      <StoredImage
        src={paper.fileUrl(node.fileId ?? "")}
        alt={node.decorative ? "" : (node.alt ?? "")}
        loading="eager"
        removed={m.fileRemoved({}, { locale: paper.locale })}
        className={cn("block h-auto w-full", !diagram && "rounded-[4px]")}
      />
      {node.caption ? (
        <figcaption
          dir="auto"
          className="mt-[0.3em] text-center text-[0.8em] text-neutral-600"
        >
          {node.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

function PaperFile({ node, paper }: { node: ContentNode; paper: PaperFacts }) {
  const { locale } = paper;
  const file = {
    name: node.name ?? "",
    mime: node.mime ?? "",
    ...(node.bytes === undefined ? {} : { bytes: node.bytes }),
  };
  // A picture kept as a file is still a picture, and paper can show it.
  if (file.mime.startsWith("image/"))
    return <PaperPicture node={{ ...node, size: "medium" }} paper={paper} />;
  return (
    <PaperOnline
      kind={fileMeta(file, locale) || m.printFile({}, { locale })}
      title={node.caption || file.name}
      hint={m.printScanToOpen({}, { locale })}
      link={paper.online}
    />
  );
}

/** Lines to write on, under the words that say what to write. */
function WriteOn({ label, lines }: { label: string; lines: number }) {
  return (
    <div className="grid gap-[0.1em]">
      <p className="text-[0.85em] font-semibold">{label}</p>
      <div aria-hidden className="grid">
        {Array.from({ length: lines }, (_, line) => (
          <span key={line} className="h-[2.1em] border-b border-neutral-400" />
        ))}
      </div>
    </div>
  );
}

/**
 * Code a student runs on screen. Paper cannot run it: a block that waits
 * for a prediction asks for it in writing, which is the same thinking, and
 * one that only runs carries the code that opens it.
 */
function PaperRunnable({
  node,
  drawn,
  paper,
}: {
  node: ContentNode;
  drawn: ReactNode;
  paper: PaperFacts;
}) {
  const { locale } = paper;
  const page = node.language === "html";
  return (
    <div className="paper-question grid gap-[0.4em]">
      {drawn}
      {node.$?.run === "predict" ? (
        <WriteOn label={m.printPredict({}, { locale })} lines={3} />
      ) : paper.online ? (
        <div className="flex items-center gap-[0.7em] text-[0.85em] text-neutral-600">
          <QrCode value={paper.online} className="size-[1.8cm] shrink-0" />
          <p>{(page ? m.printScanToTry : m.printScanToRun)({}, { locale })}</p>
        </div>
      ) : null}
    </div>
  );
}

function PaperAiUse({ node, paper }: { node: ContentNode; paper: PaperFacts }) {
  const { locale } = paper;
  const facts = [
    { label: m.editorAiUseTool({}, { locale }), value: node.aiTool ?? "" },
    {
      label: m.editorAiUseDate({}, { locale }),
      value: node.aiDate ? dayOf(node.aiDate, locale) : "",
    },
    { label: m.editorAiUsePrompt({}, { locale }), value: node.aiPrompt ?? "" },
    { label: m.editorAiUseHow({}, { locale }), value: node.aiUse ?? "" },
    {
      label: m.editorAiUseEvidence({}, { locale }),
      value: (node.aiEvidence ?? []).map((file) => file.name).join("\n"),
    },
  ].filter((fact) => fact.value);
  return (
    <div className="paper-question my-[0.5em] grid gap-[0.4em] rounded-[4px] border border-neutral-400 p-[0.7em]">
      <p className="text-[0.75em] font-semibold text-neutral-600">
        {m.editorAiUse({}, { locale })}
      </p>
      <dl className="grid gap-[0.4em] text-[0.9em]">
        {facts.map((fact) => (
          <div key={fact.label} className="grid gap-[0.05em]">
            <dt className="text-[0.85em] text-neutral-600">{fact.label}</dt>
            <dd className="whitespace-pre-wrap">
              <bdi>{fact.value}</bdi>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * A block's paper form, wherever in the document it sits, for the blocks
 * that cannot print as they read: what plays, opens or runs becomes its
 * name and a code to scan, a picture prints at the size it was given, and
 * a link shows the address it leads to. Undefined leaves a block to print
 * as it reads.
 */
export function paperForm(
  node: ContentNode,
  drawn: ReactNode,
  paper: PaperFacts,
): ReactNode | undefined {
  const { locale } = paper;
  switch (node.type) {
    case "image":
    case "diagram":
      return node.fileId ? <PaperPicture node={node} paper={paper} /> : null;
    case "media":
      return node.fileId ? <PaperRecording node={node} paper={paper} /> : null;
    case "file":
      return node.fileId ? <PaperFile node={node} paper={paper} /> : null;
    case "embed": {
      if (!node.provider || !node.embedId) return null;
      const page =
        node.url ??
        embedPage({ provider: node.provider, embedId: node.embedId });
      const typed = typedAddress(page);
      return (
        <PaperOnline
          kind={embedProviderNames[node.provider]}
          title={node.caption || node.title || undefined}
          hint={m.printScanToWatch({}, { locale })}
          link={page}
          address={typed.length <= TYPED ? typed : undefined}
        />
      );
    }
    case "code":
      return node.$?.run ? (
        <PaperRunnable node={node} drawn={drawn} paper={paper} />
      ) : undefined;
    case "ai-use":
      return <PaperAiUse node={node} paper={paper} />;
    case "link":
    case "autolink": {
      // Words that lead somewhere say nothing on paper unless the address
      // is printed after them; a link that is its own address already does.
      const typed = node.url?.startsWith("http") ? typedAddress(node.url) : "";
      const words = (node.children ?? [])
        .map((child) => child.text ?? "")
        .join("");
      if (!typed || typed.length > TYPED || words.includes(typed))
        return undefined;
      return (
        <>
          {drawn}{" "}
          <span dir="ltr" className="text-[0.85em] text-neutral-600">
            ({typed})
          </span>
        </>
      );
    }
    default:
      return undefined;
  }
}
