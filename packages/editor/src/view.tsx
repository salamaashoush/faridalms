import type { ContentDocument, ContentNode } from "@faridalms/domain/content";
import type { CSSProperties, ReactNode } from "react";

import {
  contentPlainText,
  textDirection,
  validContentStyle,
} from "@faridalms/domain/content";
import { embedPage, embedProviderNames } from "@faridalms/domain/embed";
import { isSafeContentUrl } from "@faridalms/domain/rich-text";
import { ExternalLink } from "lucide-react";
import { createElement } from "react";

import type { FileStrings } from "./files";

import { FileCard, PictureView } from "./files";
import { blockAlignClass, diagramImageClass, imageSizeClass } from "./format";
import { EmbedFrame, MediaPlayer } from "./media-view";
import { editorTheme } from "./theme";

export { editorFrame } from "./frame";

export interface ViewStrings extends FileStrings {
  checklist: string;
  diagram: string;
  embedLoad: (provider: string) => string;
  embedPrivacy: (provider: string) => string;
  embedOpen: (provider: string) => string;
}

interface Context {
  strings: ViewStrings;
  fileUrl?: (fileId: string) => string;
  locale: string;
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

const heading = { h1: "h2", h2: "h3", h3: "h4" } as const;
const headingClass = { h1: "fe-h1", h2: "fe-h2", h3: "fe-h3" } as const;

function highlightClass(type: string | null | undefined): string | undefined {
  const map = editorTheme.codeHighlight;
  if (!type || !map) return undefined;
  const value: unknown = map[type];
  return typeof value === "string" ? value : undefined;
}

function renderText(node: ContentNode, key: string): ReactNode {
  const format = typeof node.format === "number" ? node.format : 0;
  let text: ReactNode = node.text;
  if (format & 16) text = <code className="fe-code-inline">{text}</code>;
  if (format & 1) text = <strong className="fe-bold">{text}</strong>;
  if (format & 2) text = <em className="fe-italic">{text}</em>;
  if (format & 4) text = <s className="fe-strike">{text}</s>;
  if (format & 8) text = <u className="fe-underline">{text}</u>;
  if (format & 32) text = <sub className="fe-sub">{text}</sub>;
  if (format & 64) text = <sup className="fe-sup">{text}</sup>;
  return (
    <span
      key={key}
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

function render(node: ContentNode, key: string, context: Context): ReactNode {
  if (
    node.type === "text" ||
    node.type === "code-highlight" ||
    node.type === "tab"
  )
    return renderText(node, key);
  const children = node.children?.map((child, index) =>
    render(child, `${key}.${index}`, context),
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
      const Heading = heading[tag];
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
    case "code":
      return (
        <pre key={key} className="fe-code-block" data-language={node.language}>
          <code>{children}</code>
        </pre>
      );
    case "linebreak":
      return <br key={key} />;
    case "horizontalrule":
      return <hr key={key} className="fe-hr" />;
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
    case "table":
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
                    createElement("col", { style: { width } }),
                  ),
                )
              : null}
            <tbody>{children}</tbody>
          </table>
        </div>
      );
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
      return (
        <PictureView
          key={key}
          src={src}
          alt={node.alt ?? ""}
          caption={node.caption ?? ""}
          className={`my-3 ${imageSizeClass[node.size ?? "large"]} ${blockAlignClass(node.format)}`}
          strings={context.strings}
          locale={context.locale}
        />
      );
    }
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
            locale={context.locale}
            captionsLabel={context.strings.captions}
          />
          {node.caption ? (
            <figcaption className="text-center text-sm text-muted-foreground">
              {node.caption}
            </figcaption>
          ) : null}
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
          <img
            src={src}
            alt={node.caption || context.strings.diagram}
            loading="lazy"
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
          <FileCard
            file={{
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

export function ContentRenderer({
  document,
  strings,
  fileUrl,
  locale = "en",
  className,
}: {
  document: ContentDocument;
  strings: ViewStrings;
  fileUrl?: (fileId: string) => string;
  locale?: string;
  className?: string;
}) {
  return (
    <div
      className={className ? `fe ${className}` : "fe"}
      dir={textDirection(contentPlainText(document)) ?? undefined}
    >
      {render(document.root, "root", { strings, fileUrl, locale })}
    </div>
  );
}
