import type { ContentDocument, ContentNode } from "@faridalms/domain/content";
import type {
  ComponentProps,
  ComponentType,
  CSSProperties,
  ReactElement,
  ReactNode,
} from "react";

import { parseChapters } from "@faridalms/domain/chapters";
import {
  codeSource,
  contentPlainText,
  textDirection,
  validContentStyle,
} from "@faridalms/domain/content";
import {
  headingLevel,
  topHeadingLevel,
} from "@faridalms/domain/content-checks";
import {
  embedPage,
  embedProviderNames,
  framedKey,
} from "@faridalms/domain/embed";
import { isSafeContentUrl } from "@faridalms/domain/rich-text";
import { ExternalLink, Target } from "lucide-react";
import { cloneElement, createElement, Fragment, isValidElement } from "react";

import type { AiUseViewStrings } from "./ai-use-view";
import type { ChartStrings } from "./chart-view";
import type { FileFacts } from "./files";
import type { PanelStrings } from "./panels-view";
import type { LabelViewStrings } from "./picture-labels";
import type { PicturesViewStrings } from "./pictures-view";
import type { MediaWatch } from "./player";

import { AiUseView } from "./ai-use-view";
import { ChartView } from "./chart-view";
import { useFileFacts } from "./file-facts";
import { FileCard, PictureView, StoredImage } from "./files";
import { blockAlignClass, diagramImageClass, imageSizeClass } from "./format";
import { MathText } from "./math";
import { EmbedFrame, MediaPlayer, MediaTranscript } from "./media-view";
import { PanelsView } from "./panels-view";
import { LabelledPicture } from "./picture-labels";
import { CompareView, GalleryView } from "./pictures-view";
import { editorTheme } from "./theme";

export { editorFrame } from "./frame";

export interface ViewStrings
  extends
    AiUseViewStrings,
    PanelStrings,
    LabelViewStrings,
    PicturesViewStrings,
    ChartStrings {
  checklist: string;
  studentCopy: string;
  diagram: string;
  embedLoad: (provider: string) => string;
  embedPrivacy: (provider: string) => string;
  embedOpen: (provider: string) => string;
  drawTitle: string;
  drawSummary: (count: number, tag: string) => string;
  drawPointsEach: (points: number) => string;
  drawNoTag: string;
  standardsBlock: string;
}

/** A passage drawn marked in the reader, as a comment points at it. */
export interface ContentMark {
  id: string;
  start: { block: string; offset: number };
  end: { block: string; offset: number };
  /** A passage being commented on, marked but pointing at no comment yet. */
  draft?: boolean;
}

/**
 * Marks as places in reading order: a block's index among the blocks and a
 * count of its own characters. Offsets fill in as the text is drawn.
 */
interface Marking {
  marks: {
    id: string;
    draft: boolean;
    from: [number, number];
    to: [number, number];
  }[];
  order: Map<string, number>;
  offsets: Map<string, number>;
  active: string | null;
}

interface Context {
  strings: ViewStrings;
  /** The document's largest heading, which reads as the level under the page's title. */
  top: number;
  fileUrl?: (fileId: string) => string;
  locale: string;
  marking?: Marking;
  watch?: ((fileId: string) => MediaWatch | undefined) | undefined;
  runnable?: ComponentType<RunnableProps> | undefined;
  predicted?: boolean | undefined;
  replace?: Replace | undefined;
}

/**
 * Draws a block in the reader's place wherever it sits, inside a column or a
 * table cell as at the top: paper draws a recording as a code to scan. What
 * it returns undefined for keeps the reader's own drawing.
 */
export type Replace = (
  node: ContentNode,
  drawn: ReactNode,
) => ReactNode | undefined;

/** A code block students can run: its program, and how it reads unrun. */
export interface RunnableProps {
  /** The block's id, which a student's own version of it is kept under. */
  blockId: string | undefined;
  source: string;
  language: string;
  drawn: ReactNode;
  /** Waiting for the question above to be answered with a prediction. */
  locked: boolean;
}

/** How a recording's playing is followed, held to what was played if the teacher asks. */
function watchOf(node: ContentNode, context: Context): MediaWatch | undefined {
  const key =
    node.fileId ??
    (node.type === "embed" &&
    (node.provider === "youtube" || node.provider === "vimeo") &&
    node.embedId
      ? framedKey(node.provider, node.embedId)
      : null);
  const watch = key ? context.watch?.(key) : undefined;
  return watch && node.noSkipping ? { ...watch, noSkipping: true } : watch;
}

function markingOf(
  document: ContentDocument,
  marks: ContentMark[],
  active: string | null,
): Marking {
  const order = new Map<string, number>();
  const visit = (node: ContentNode) => {
    const id = node.$?.id;
    if (id && !order.has(id)) order.set(id, order.size);
    node.children?.forEach(visit);
  };
  visit(document.root);
  return {
    marks: marks.flatMap((mark) => {
      const from = order.get(mark.start.block);
      const to = order.get(mark.end.block);
      return from === undefined || to === undefined
        ? []
        : [
            {
              id: mark.id,
              draft: mark.draft ?? false,
              from: [from, mark.start.offset] as [number, number],
              to: [to, mark.end.offset] as [number, number],
            },
          ];
    }),
    order,
    offsets: new Map(),
    active,
  };
}

/**
 * A text node's words cut where marks begin and end, each piece with the
 * marks covering it. The node's place in its block is counted here, in the
 * order the reader draws text, as anchors count it on the page.
 */
function markedPieces(
  text: string,
  marking: Marking | undefined,
  block: string | undefined,
): { text: string; ids: string[]; draft: boolean }[] {
  if (!marking || !block || !marking.marks.length)
    return [{ text, ids: [], draft: false }];
  const start = marking.offsets.get(block) ?? 0;
  marking.offsets.set(block, start + text.length);
  const index = marking.order.get(block);
  if (index === undefined) return [{ text, ids: [], draft: false }];
  const spans = marking.marks.flatMap((mark) => {
    if (mark.from[0] > index || mark.to[0] < index) return [];
    const from = mark.from[0] === index ? Math.max(0, mark.from[1] - start) : 0;
    const to =
      mark.to[0] === index
        ? Math.min(text.length, mark.to[1] - start)
        : text.length;
    return from < to ? [{ mark, from, to }] : [];
  });
  if (!spans.length) return [{ text, ids: [], draft: false }];
  const cuts = [
    ...new Set([
      0,
      text.length,
      ...spans.flatMap((span) => [span.from, span.to]),
    ]),
  ].toSorted((a, b) => a - b);
  return cuts.slice(0, -1).map((cut, at) => {
    const end = cuts[at + 1] ?? text.length;
    const covering = spans.filter((span) => span.from <= cut && end <= span.to);
    return {
      text: text.slice(cut, end),
      ids: covering
        .filter((span) => !span.mark.draft)
        .map((span) => span.mark.id),
      draft: covering.some((span) => span.mark.draft),
    };
  });
}

function textStyle(serialized = ""): CSSProperties {
  if (!validContentStyle(serialized)) return {};
  const result: CSSProperties = {};
  for (const entry of serialized.split(";")) {
    const [key, value] = entry.split(":").map((part) => part.trim());
    if (key === "color") result.color = value;
    if (key === "background-color") result.backgroundColor = value;
    if (key === "font-family") result.fontFamily = value;
    if (key === "font-size") result.fontSize = value;
  }
  return result;
}

function template(layout = "1:1"): string {
  return layout
    .split(":")
    .map((part) => `minmax(0,${part}fr)`)
    .join(" ");
}

/**
 * A column's part of its table's width. A screen scrolls a table wider than
 * its page; paper cannot, and sets the columns by their shares instead.
 */
function shareOf(width: number, widths: readonly number[] = []): string {
  const whole = widths.reduce((sum, each) => sum + each, 0);
  return whole > 0 ? `${((width / whole) * 100).toFixed(3)}%` : "auto";
}

const headingClass = { h1: "fe-h1", h2: "fe-h2", h3: "fe-h3" } as const;

function highlightClass(type: string | null | undefined): string | undefined {
  const map = editorTheme.codeHighlight;
  if (!type || !map) return undefined;
  const value: unknown = map[type];
  return typeof value === "string" ? value : undefined;
}

function formatted(words: string, format: number): ReactNode {
  let text: ReactNode = words;
  if (format & 16) text = <code className="fe-code-inline">{text}</code>;
  if (format & 1) text = <strong className="fe-bold">{text}</strong>;
  if (format & 2) text = <em className="fe-italic">{text}</em>;
  if (format & 4) text = <s className="fe-strike">{text}</s>;
  if (format & 8) text = <u className="fe-underline">{text}</u>;
  if (format & 32) text = <sub className="fe-sub">{text}</sub>;
  if (format & 64) text = <sup className="fe-sup">{text}</sup>;
  return text;
}

function renderText(
  node: ContentNode,
  key: string,
  context: Context,
  block: string | undefined,
): ReactNode {
  const format = typeof node.format === "number" ? node.format : 0;
  const active = context.marking?.active ?? null;
  // Commented passages are marks of their own, each pointing at the
  // comments on it, so assistive technology finds them as readers do.
  const text = markedPieces(node.text ?? "", context.marking, block).map(
    (piece, index) =>
      piece.ids.length || piece.draft ? (
        <mark
          key={index}
          className="fe-mark"
          data-comments={piece.ids.join(" ") || undefined}
          data-draft={piece.draft ? "" : undefined}
          data-depth={piece.ids.length > 1 ? 2 : 1}
          data-active={
            piece.draft || (active !== null && piece.ids.includes(active))
              ? ""
              : undefined
          }
          aria-details={
            piece.ids.map((id) => `comment-${id}`).join(" ") || undefined
          }
        >
          {formatted(piece.text, format)}
        </mark>
      ) : (
        <Fragment key={index}>{formatted(piece.text, format)}</Fragment>
      ),
  );
  // Marks the document's own words, which comments count characters in;
  // labels the reader adds renderBlock them read differently per language.
  return (
    <span
      key={key}
      data-fe-text=""
      style={textStyle(node.style)}
      className={
        node.type === "code-highlight"
          ? highlightClass(node.highlightType)
          : undefined
      }
    >
      {text}
    </span>
  );
}

/** Blocks without children, which a reader may still draw another way. */
const LEAF_BLOCKS = new Set<ContentNode["type"]>([
  "image",
  "file",
  "media",
  "embed",
  "diagram",
  "gate",
  "draw",
  "standards",
  "ai-use",
]);

/**
 * A node as the reader draws it, carrying its block id when it has one, so
 * a comment can point into the block it was made on.
 */
function render(
  node: ContentNode,
  key: string,
  context: Context,
  block?: string,
): ReactNode {
  const drawn = draw(node, key, context, node.$?.id ?? block);
  const replaced =
    node.children !== undefined || LEAF_BLOCKS.has(node.type)
      ? context.replace?.(node, drawn)
      : undefined;
  if (replaced !== undefined) return <Fragment key={key}>{replaced}</Fragment>;
  const id = node.$?.id;
  return id && isValidElement(drawn) && typeof drawn.type === "string"
    ? cloneElement(drawn as ReactElement<Record<string, unknown>>, {
        "data-block-id": id,
      })
    : drawn;
}

function draw(
  node: ContentNode,
  key: string,
  context: Context,
  block: string | undefined,
): ReactNode {
  if (
    node.type === "text" ||
    node.type === "code-highlight" ||
    node.type === "tab"
  )
    return renderText(node, key, context, block);
  // A set of parts draws its titles and bodies itself; drawing them here
  // too would count their words twice where comments mark them.
  const children =
    node.type === "panels"
      ? undefined
      : node.children?.map((child, index) =>
          render(child, `${key}.${index}`, context, block),
        );
  const style: CSSProperties = {
    ...textStyle(node.style),
    textAlign:
      typeof node.format === "string" && node.format ? node.format : undefined,
    paddingInlineStart: node.indent ? `${node.indent * 1.6}rem` : undefined,
  };
  const props = { style, dir: node.direction ?? "auto" };
  switch (node.type) {
    case "root":
      return children;
    case "paragraph":
      return (
        <p key={key} className="fe-p" {...props}>
          {children?.length ? children : <br />}
        </p>
      );
    case "heading": {
      const tag = node.tag === "h1" || node.tag === "h2" ? node.tag : "h3";
      const level = Math.min(6, (headingLevel(node) ?? 3) - context.top + 2);
      const Heading = `h${level}` as "h2" | "h3" | "h4" | "h5" | "h6";
      return (
        <Heading key={key} className={headingClass[tag]} {...props}>
          {children}
        </Heading>
      );
    }
    case "quote":
      return (
        <blockquote key={key} className="fe-quote" {...props}>
          {children}
        </blockquote>
      );
    case "code": {
      const drawn = (
        <pre key={key} className="fe-code-block" data-language={node.language}>
          <code>{children}</code>
        </pre>
      );
      const run = node.$?.run;
      const Runnable = context.runnable;
      return run && Runnable ? (
        <Runnable
          key={key}
          blockId={node.$?.id}
          source={codeSource(node)}
          language={node.language ?? ""}
          drawn={drawn}
          locked={run === "predict" && context.predicted === false}
        />
      ) : (
        drawn
      );
    }
    case "math":
      return node.latex?.trim() ? (
        <MathText
          key={key}
          latex={node.latex}
          display={Boolean(node.block)}
          rtl={node.direction === "rtl"}
        />
      ) : null;
    case "linebreak":
      return <br key={key} />;
    case "horizontalrule":
      return <hr key={key} className="fe-hr" />;
    case "pagebreak":
      return <div key={key} aria-hidden className="fe-page-break" />;
    case "list": {
      if (node.listType === "number")
        return (
          <ol key={key} className="fe-ol" {...props} start={node.start}>
            {children}
          </ol>
        );
      return (
        <ul
          key={key}
          className={node.listType === "check" ? "fe-checklist" : "fe-ul"}
          {...props}
        >
          {children}
        </ul>
      );
    }
    case "listitem": {
      const nested = node.children?.some((child) => child.type === "list");
      const check = node.checked !== undefined;
      return (
        <li
          key={key}
          {...props}
          value={node.value}
          className={
            nested ? "fe-li fe-li-nested" : check ? "fe-li-check" : "fe-li"
          }
        >
          {check && !nested ? (
            <input
              type="checkbox"
              checked={node.checked}
              readOnly
              disabled
              aria-label={context.strings.checklist}
            />
          ) : null}
          {children}
        </li>
      );
    }
    case "link":
    case "autolink":
      return node.url && isSafeContentUrl(node.url) ? (
        <a
          key={key}
          className="fe-link"
          href={node.url}
          title={node.title ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      ) : (
        <span key={key}>{children}</span>
      );
    case "table": {
      // A first row of header cells is the table's head: a screen reader
      // names each cell by it, and a browser printing page by page repeats
      // it at the top of each page the table runs onto.
      const first = node.children?.[0]?.children ?? [];
      const head =
        first.length > 0 &&
        first.every((cell) => ((cell.headerState ?? 0) & 1) === 1)
          ? children?.[0]
          : null;
      return (
        <div key={key} className="fe-table-wrap">
          <table
            className={
              node.rowStriping ? "fe-table fe-table-striped" : "fe-table"
            }
          >
            {node.colWidths?.length
              ? createElement(
                  "colgroup",
                  null,
                  ...node.colWidths.map((width) =>
                    createElement("col", {
                      style: {
                        width,
                        "--share": shareOf(width, node.colWidths),
                      },
                    }),
                  ),
                )
              : null}
            {head ? <thead>{head}</thead> : null}
            <tbody>{head ? children?.slice(1) : children}</tbody>
          </table>
        </div>
      );
    }
    case "tablerow":
      return (
        <tr key={key} {...props}>
          {children}
        </tr>
      );
    case "tablecell": {
      const Cell = node.headerState ? "th" : "td";
      return (
        <Cell
          key={key}
          dir={props.dir}
          colSpan={node.colSpan}
          rowSpan={node.rowSpan}
          className={node.headerState ? "fe-cell fe-cell-header" : "fe-cell"}
          style={{
            ...style,
            verticalAlign: node.verticalAlign,
            backgroundColor: node.backgroundColor ?? undefined,
          }}
        >
          {children}
        </Cell>
      );
    }
    case "callout":
      return (
        <aside key={key} className="fe-callout" data-tone={node.tone ?? "info"}>
          {children}
        </aside>
      );
    case "starter":
      return (
        <div
          key={key}
          className="fe-starter"
          data-label={context.strings.studentCopy}
        >
          {children}
        </div>
      );
    case "toggle":
      return (
        <details key={key} className="fe-toggle" open={node.open ?? true}>
          {children}
        </details>
      );
    case "toggle-title":
      return (
        <summary key={key} className="fe-toggle-title" {...props}>
          {children}
        </summary>
      );
    case "toggle-content":
      return (
        <div key={key} className="fe-toggle-content">
          {children}
        </div>
      );
    case "panels":
      return (
        <PanelsView
          key={key}
          layout={
            node.layout === "steps" ||
            node.layout === "timeline" ||
            node.layout === "cards"
              ? node.layout
              : "tabs"
          }
          printed={node.open ?? false}
          strings={context.strings}
          items={(node.children ?? []).map((panel, index) => {
            const [title, body] = panel.children ?? [];
            const at = `${key}.${index}`;
            return {
              key: at,
              title: title?.children?.map((child, place) =>
                render(child, `${at}.0.${place}`, context, block),
              ),
              body: body ? render(body, `${at}.1`, context, block) : null,
            };
          })}
        />
      );
    case "panel-body":
      return (
        <div key={key} className="fe-panel-body">
          {children}
        </div>
      );
    // A question read outside the player shows what it asks, never its key.
    case "question":
      return (
        <div
          key={key}
          className="fe-question"
          data-kind={node.kind}
          data-multiple={String(node.multiple ?? false)}
        >
          {children}
        </div>
      );
    case "question-prompt":
      return (
        <div key={key} className="fe-question-prompt" dir="auto">
          {children}
        </div>
      );
    case "question-option":
      return (
        <div key={key} className="fe-question-option" dir="auto">
          {children}
        </div>
      );
    case "question-answer":
      return null;
    case "question-pair":
      return (
        <div key={key} className="fe-question-pair">
          {children}
        </div>
      );
    case "question-group":
      return (
        <div key={key} className="fe-question-group">
          {children}
        </div>
      );
    case "gate":
      return null;
    // Outside a student's attempt a draw says what it asks, not what it drew.
    case "draw":
      return (
        <div key={key} className="fe-draw" dir="auto">
          <p className="fe-draw-title">{context.strings.drawTitle}</p>
          <p>
            {node.bankTag
              ? `${context.strings.drawSummary(node.count ?? 1, node.bankTag)} · ${context.strings.drawPointsEach(node.points ?? 1)}`
              : context.strings.drawNoTag}
          </p>
        </div>
      );
    case "standards":
      return (
        <div key={key} className="fe-standards">
          <p className="fe-standards-title">
            <Target aria-hidden className="size-3.5" />
            {context.strings.standardsBlock}
          </p>
          <ul>
            {(node.targets ?? []).map((target) => (
              <li key={target.id} dir="auto">
                {target.code ? (
                  <>
                    <span className="fe-standards-code">
                      {target.code}
                    </span>{" "}
                  </>
                ) : null}
                {target.statement}
              </li>
            ))}
          </ul>
        </div>
      );
    case "ai-use":
      return (
        <AiUseView
          key={key}
          fields={{
            tool: node.aiTool ?? "",
            date: node.aiDate ?? "",
            prompt: node.aiPrompt ?? "",
            use: node.aiUse ?? "",
            evidence: node.aiEvidence ?? [],
          }}
          strings={context.strings}
          locale={context.locale}
          url={(fileId) => context.fileUrl?.(fileId)}
        />
      );
    case "question-passage":
      return (
        <div key={key} className="fe-question-passage" dir="auto">
          {children}
        </div>
      );
    case "question-gap":
      return <span key={key} className="fe-question-gap" />;
    case "question-side":
      return (
        <div key={key} className="fe-question-side" dir="auto">
          {children}
        </div>
      );
    case "columns":
      return (
        <div
          key={key}
          className="fe-columns"
          style={{ "--columns": template(node.layout) } as CSSProperties}
        >
          {children}
        </div>
      );
    case "column":
      return (
        <div key={key} className="fe-column">
          {children}
        </div>
      );
    case "image": {
      const src = node.fileId ? context.fileUrl?.(node.fileId) : undefined;
      if (!src) return null;
      const className = `my-3 ${imageSizeClass[node.size ?? "large"]} ${blockAlignClass(node.format)}`;
      const picture = (
        <PictureView
          key={key}
          src={src}
          alt={node.decorative ? "" : (node.alt ?? "")}
          caption={node.labels?.length ? "" : (node.caption ?? "")}
          className={node.labels?.length ? "" : className}
          strings={context.strings}
          locale={context.locale}
        />
      );
      return node.labels?.length ? (
        <figure key={key} className={className}>
          <LabelledPicture
            picture={picture}
            labels={node.labels}
            printed={node.open ?? false}
            strings={context.strings}
          />
          {node.caption ? (
            <figcaption className="mt-1.5 text-center text-sm text-muted-foreground">
              {node.caption}
            </figcaption>
          ) : null}
        </figure>
      ) : (
        picture
      );
    }
    case "chart":
      return node.chart ? (
        <ChartView
          key={key}
          chart={node.chart}
          strings={context.strings}
          locale={context.locale}
          printed={node.open ?? false}
        />
      ) : null;
    case "gallery":
      return (
        <GalleryView
          key={key}
          pictures={node.pictures ?? []}
          url={(fileId) => context.fileUrl?.(fileId)}
          strings={context.strings}
          locale={context.locale}
        />
      );
    case "compare":
      return (
        <div
          key={key}
          className={`my-3 ${imageSizeClass[node.size ?? "large"]} ${blockAlignClass(node.format)}`}
        >
          <CompareView
            pictures={node.pictures ?? []}
            url={(fileId) => context.fileUrl?.(fileId)}
            printed={node.open ?? false}
            strings={context.strings}
          />
        </div>
      );
    case "media": {
      const src = node.fileId ? context.fileUrl?.(node.fileId) : undefined;
      if (!src) return null;
      return (
        <figure
          key={key}
          className={`my-3 grid gap-1.5 ${imageSizeClass[node.size ?? "full"]} ${blockAlignClass(node.format)}`}
        >
          <MediaPlayer
            src={src}
            captions={
              node.captionsFileId
                ? context.fileUrl?.(node.captionsFileId)
                : undefined
            }
            video={(node.mime ?? "").startsWith("video/")}
            captionsLang={node.captionsLang}
            locale={context.locale}
            captionsLabel={context.strings.captions}
            watch={watchOf(node, context)}
            strings={context.strings}
            chapters={parseChapters(node.chapters ?? "")}
          />
          {node.caption ? (
            <figcaption className="text-center text-sm text-muted-foreground">
              {node.caption}
            </figcaption>
          ) : null}
          <MediaTranscript
            text={node.transcript}
            label={context.strings.transcript}
          />
        </figure>
      );
    }
    case "embed": {
      if (!node.provider || !node.embedId) return null;
      const name = embedProviderNames[node.provider];
      const embed = { provider: node.provider, embedId: node.embedId };
      return (
        <figure
          key={key}
          className={`my-3 grid gap-1.5 ${imageSizeClass[node.size ?? "full"]} ${blockAlignClass(node.format)}`}
        >
          <EmbedFrame
            {...embed}
            loadLabel={context.strings.embedLoad(name)}
            privacy={context.strings.embedPrivacy(name)}
            locale={context.locale}
            watch={watchOf(node, context)}
            chapters={parseChapters(node.chapters ?? "")}
            chaptersLabel={context.strings.chapters}
          />
          <div className="flex items-center justify-between gap-2">
            {node.caption ? (
              <figcaption className="text-sm text-muted-foreground">
                {node.caption}
              </figcaption>
            ) : (
              <span />
            )}
            <a
              href={embedPage(embed)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="size-3.5" aria-hidden />
              {context.strings.embedOpen(name)}
            </a>
          </div>
        </figure>
      );
    }
    case "diagram": {
      const src = node.fileId ? context.fileUrl?.(node.fileId) : undefined;
      if (!src) return null;
      return (
        <figure
          key={key}
          className={`my-3 ${imageSizeClass[node.size ?? "large"]} ${blockAlignClass(node.format)}`}
        >
          <StoredImage
            src={src}
            alt={node.caption || context.strings.diagram}
            loading="lazy"
            removed={context.strings.fileRemoved}
            className={`${diagramImageClass} rounded-lg`}
          />
          {node.caption ? (
            <figcaption className="mt-1.5 text-center text-sm text-muted-foreground">
              {node.caption}
            </figcaption>
          ) : null}
        </figure>
      );
    }
    case "file": {
      const href = node.fileId ? context.fileUrl?.(node.fileId) : undefined;
      return (
        <div key={key} className="my-3">
          <ReadFile
            fileId={node.fileId}
            kept={{
              name: node.name ?? "",
              mime: node.mime ?? "",
              bytes: node.bytes ?? 0,
            }}
            url={href}
            display={node.display}
            caption={node.caption}
            strings={context.strings}
            locale={context.locale}
          />
        </div>
      );
    }
  }
  return null;
}

function ReadFile({
  fileId,
  kept,
  ...card
}: Omit<ComponentProps<typeof FileCard>, "file"> & {
  fileId: string | undefined;
  kept: Required<FileFacts>;
}) {
  return <FileCard file={useFileFacts(fileId, kept)} {...card} />;
}

export function ContentRenderer({
  document,
  strings,
  fileUrl,
  locale = "en",
  className,
  marks,
  activeMark = null,
  renderBlock,
  replace,
  watch,
  runnable,
  predicted,
}: {
  document: ContentDocument;
  strings: ViewStrings;
  fileUrl?: (fileId: string) => string;
  locale?: string;
  className?: string;
  /** Counts what a student plays of each recording, by file. */
  watch?: ((fileId: string) => MediaWatch | undefined) | undefined;
  /** Passages to draw marked, as comments on handed-in work point at them. */
  marks?: ContentMark[];
  activeMark?: string | null;
  /** Draws something renderBlock each top-level block, such as a speaker that reads it. */
  renderBlock?: (node: ContentNode, drawn: ReactNode) => ReactNode;
  replace?: Replace;
  /** Draws code blocks students can run; without it they show as code. */
  runnable?: ComponentType<RunnableProps>;
  /**
   * Whether the question above this part of a lesson is answered, which a
   * code block waiting for a prediction needs before it runs.
   */
  predicted?: boolean;
}) {
  const marking = marks?.length
    ? markingOf(document, marks, activeMark)
    : undefined;
  const context = {
    strings,
    top: topHeadingLevel(document),
    fileUrl,
    locale,
    marking,
    watch,
    runnable,
    predicted,
    replace,
  };
  return (
    <div
      className={className ? `fe ${className}` : "fe"}
      dir={textDirection(contentPlainText(document)) ?? undefined}
    >
      {renderBlock
        ? document.root.children?.map((child, index) => (
            <Fragment key={`root.${index}`}>
              {renderBlock(child, render(child, `root.${index}`, context))}
            </Fragment>
          ))
        : render(document.root, "root", context)}
    </div>
  );
}
