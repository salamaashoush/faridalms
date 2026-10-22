import type { ContentDocument, ContentNode } from "./content";

import { sourceText } from "./citations";
import { embedPage, embedSource } from "./embed";
import { isSafeContentUrl } from "./rich-text";

/**
 * A document as plain HTML for another system to show, a Common Cartridge
 * page among them: its words, lists, tables, pictures, recordings, files
 * and embedded pages, without the look this app gives them. Questions and
 * what only this app can run (gates, draws, links to its outside tools)
 * are left to whoever writes the package, as they travel in other forms.
 */
export interface HtmlOptions {
  /** Where a stored file is found from the page; none leaves it out. */
  fileHref: (fileId: string, name: string) => string | null;
}

const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** Lexical's text formats, as its bits name them. */
const FORMATS: [number, string][] = [
  [16, "code"],
  [1, "strong"],
  [2, "em"],
  [8, "u"],
  [4, "s"],
  [32, "sub"],
  [64, "sup"],
  [128, "mark"],
];

const SKIPPED = new Set<ContentNode["type"]>([
  "question",
  "gate",
  "draw",
  "standards",
  "shared",
  "starter",
  "ai-use",
  "lti",
  "glossary",
  "pagebreak",
  "diagram",
]);

const dirOf = (node: ContentNode) =>
  node.direction ? ` dir="${node.direction}"` : "";

function text(node: ContentNode): string {
  const format = typeof node.format === "number" ? node.format : 0;
  let html = escape(node.text ?? "");
  for (const [bit, tag] of FORMATS)
    if (format & bit) html = `<${tag}>${html}</${tag}>`;
  return html;
}

function codeText(node: ContentNode): string {
  if (node.type === "linebreak") return "\n";
  if (node.type === "tab") return "\t";
  return node.text ?? (node.children ?? []).map(codeText).join("");
}

function fileName(node: { name?: string; alt?: string }, fallback: string) {
  return node.name?.trim() || node.alt?.trim() || fallback;
}

/** Writes a document's nodes as HTML, gathering its footnotes as it goes. */
class Writer {
  readonly notes: string[] = [];

  constructor(private readonly options: HtmlOptions) {}

  all(nodes: ContentNode[] | undefined): string {
    return (nodes ?? []).map((node) => this.node(node)).join("");
  }

  picture(fileId: string, alt: string, caption?: string): string {
    const href = this.options.fileHref(fileId, alt || "picture");
    if (!href) return "";
    const src = escape(href);
    return `<figure><img src="${src}" alt="${escape(alt)}">${
      caption ? `<figcaption>${escape(caption)}</figcaption>` : ""
    }</figure>`;
  }

  node(node: ContentNode): string {
    if (SKIPPED.has(node.type)) return "";
    const inner = () => this.all(node.children);
    switch (node.type) {
      case "text":
      case "code-highlight":
        return text(node);
      case "linebreak":
        return "<br>";
      case "tab":
        return "\t";
      case "paragraph": {
        const body = inner();
        return body ? `<p${dirOf(node)}>${body}</p>` : "";
      }
      case "heading": {
        const tag = /^h[1-6]$/.test(node.tag ?? "") ? node.tag : "h2";
        return `<${tag}${dirOf(node)}>${inner()}</${tag}>`;
      }
      case "quote":
        return `<blockquote${dirOf(node)}>${inner()}</blockquote>`;
      case "list": {
        const tag = node.listType === "number" ? "ol" : "ul";
        const start =
          tag === "ol" && node.start && node.start !== 1
            ? ` start="${node.start}"`
            : "";
        return `<${tag}${start}${dirOf(node)}>${(node.children ?? [])
          .map((item) =>
            node.listType === "check"
              ? `<li>${item.checked ? "☑" : "☐"} ${this.all(item.children)}</li>`
              : this.node(item),
          )
          .join("")}</${tag}>`;
      }
      case "listitem":
        return `<li>${inner()}</li>`;
      case "link":
      case "autolink":
        return node.url && isSafeContentUrl(node.url)
          ? `<a href="${escape(node.url)}">${inner()}</a>`
          : inner();
      case "code":
        return `<pre><code>${escape(codeText(node))}</code></pre>`;
      case "table":
        return `<table>${inner()}</table>`;
      case "tablerow":
        return `<tr>${inner()}</tr>`;
      case "tablecell": {
        const tag = node.headerState ? "th" : "td";
        const span =
          (node.colSpan && node.colSpan > 1
            ? ` colspan="${node.colSpan}"`
            : "") +
          (node.rowSpan && node.rowSpan > 1
            ? ` rowspan="${node.rowSpan}"`
            : "");
        return `<${tag}${span}>${inner()}</${tag}>`;
      }
      case "horizontalrule":
        return "<hr>";
      case "callout":
        return `<aside${dirOf(node)}>${inner()}</aside>`;
      case "toggle": {
        const [title, ...rest] = node.children ?? [];
        return `<details${node.open ? " open" : ""}><summary>${
          title ? this.all(title.children) : ""
        }</summary>${this.all(rest)}</details>`;
      }
      case "toggle-content":
      case "column":
      case "panel-body":
        return `<div>${inner()}</div>`;
      case "toggle-title":
        return `<p>${inner()}</p>`;
      case "columns":
      case "panels":
        return inner();
      case "panel":
        return `<section>${inner()}</section>`;
      case "panel-title":
        return `<h3>${inner()}</h3>`;
      case "image":
        return node.fileId
          ? this.picture(node.fileId, node.alt ?? "", node.caption)
          : "";
      case "gallery":
      case "compare":
        return (node.pictures ?? [])
          .map((item) => this.picture(item.fileId, item.alt, item.caption))
          .join("");
      case "chart": {
        const chart = node.chart;
        if (!chart) return "";
        const head = `<tr><th></th>${chart.series
          .map((series) => `<th>${escape(series.name)}</th>`)
          .join("")}</tr>`;
        const rows = chart.labels
          .map(
            (label, index) =>
              `<tr><th>${escape(label)}</th>${chart.series
                .map(
                  (series) =>
                    `<td>${series.values[index] === null || series.values[index] === undefined ? "" : String(series.values[index])}</td>`,
                )
                .join("")}</tr>`,
          )
          .join("");
        return `<table><caption>${escape(chart.title)}</caption>${head}${rows}</table>`;
      }
      case "file": {
        const name = fileName(node, "file");
        const href = node.fileId
          ? this.options.fileHref(node.fileId, name)
          : null;
        return href
          ? `<p><a href="${escape(href)}">${escape(name)}</a></p>`
          : "";
      }
      case "media": {
        const name = fileName(node, "recording");
        const href = node.fileId
          ? this.options.fileHref(node.fileId, name)
          : null;
        if (!href) return "";
        const src = escape(href);
        const video = (node.mime ?? "").startsWith("video/");
        const track = node.captionsFileId
          ? this.options.fileHref(node.captionsFileId, "captions.vtt")
          : null;
        const captions = track
          ? `<track kind="captions" src="${escape(track)}" srclang="${escape(node.captionsLang ?? "en")}" default>`
          : "";
        const player = video
          ? `<video controls src="${src}">${captions}</video>`
          : `<audio controls src="${src}">${captions}</audio>`;
        const transcript = node.transcript?.trim()
          ? `<details><summary>Transcript</summary><p>${escape(node.transcript.trim()).replaceAll("\n", "<br>")}</p></details>`
          : "";
        return `<figure>${player}${
          node.caption ? `<figcaption>${escape(node.caption)}</figcaption>` : ""
        }</figure>${transcript}`;
      }
      case "embed": {
        if (!node.provider || !node.embedId) return "";
        const embed = { provider: node.provider, embedId: node.embedId };
        const title = escape(node.title ?? node.caption ?? "");
        return `<p><iframe src="${escape(embedSource(embed))}" title="${title}" width="640" height="360" allowfullscreen></iframe></p><p><a href="${escape(embedPage(embed))}">${title || escape(embedPage(embed))}</a></p>`;
      }
      case "math": {
        const latex = escape(node.latex ?? "");
        return node.block ? `<p>\\[${latex}\\]</p>` : `\\(${latex}\\)`;
      }
      case "footnote": {
        const note = node.source ? sourceText(node.source) : (node.note ?? "");
        this.notes.push(note);
        const number = this.notes.length;
        return `${inner()}<sup><a href="#note-${number}" id="noted-${number}">${number}</a></sup>`;
      }
      case "mention":
        return escape(node.mention?.label ?? node.text ?? "");
      case "term":
        return node.definition
          ? `<dfn title="${escape(node.definition)}">${inner()}</dfn>`
          : inner();
      default:
        return inner();
    }
  }
}

export function contentHtml(
  document: ContentDocument,
  options: HtmlOptions,
): string {
  const writer = new Writer(options);
  const body = writer.all(document.root.children);
  const notes = writer.notes.length
    ? `<hr><ol>${writer.notes
        .map(
          (note, index) =>
            `<li id="note-${index + 1}">${escape(note)} <a href="#noted-${index + 1}">↩</a></li>`,
        )
        .join("")}</ol>`
    : "";
  return body + notes;
}
