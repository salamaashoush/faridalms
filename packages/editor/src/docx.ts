import type { ImageSize } from "@faridalms/domain/content";

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { ommlToLatex } from "./omml";

const WORD = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** Where an equation stood, as the reader passes text through: a numbered mark. */
const FORMULA = /(\d+)/g;
const formulaMark = (index: number) => `${index}`;
/** Joins a picture's description to the size it had on Word's page. */
const SIZE_MARK = "";

// Word measures a picture in EMUs and a page in twips, 635 EMUs each.
const EMU_PER_TWIP = 635;
/** An A4 page's text with inch margins, where a document gives no page. */
const A4_TEXT_EMU = (11_906 - 2 * 1440) * EMU_PER_TWIP;

export interface Formula {
  latex: string;
  block: boolean;
}

export interface PreparedDocx {
  docx: Uint8Array;
  formulas: Formula[];
}

/** The size a picture as wide as this share of the page's text reads at. */
export function sizeOfShare(share: number): ImageSize {
  if (share <= 0.42) return "small";
  if (share <= 0.62) return "medium";
  if (share <= 0.87) return "large";
  return "full";
}

/** How wide the page's text runs, between its margins. */
function textWidth(xml: Document): number {
  const sections = xml.getElementsByTagName("w:sectPr");
  const section = sections[sections.length - 1];
  const page = section?.getElementsByTagName("w:pgSz")[0];
  const margins = section?.getElementsByTagName("w:pgMar")[0];
  const width = Number(page?.getAttribute("w:w"));
  const left = Number(margins?.getAttribute("w:left") ?? 0);
  const right = Number(margins?.getAttribute("w:right") ?? 0);
  const text = (width - left - right) * EMU_PER_TWIP;
  return Number.isFinite(text) && text > 0 ? text : A4_TEXT_EMU;
}

/** A run of words holding only a formula's mark. */
function markRun(xml: Document, index: number): Element {
  const run = xml.createElementNS(WORD, "w:r");
  const words = xml.createElementNS(WORD, "w:t");
  words.textContent = formulaMark(index);
  run.append(words);
  return run;
}

/**
 * A Word document readied for the reader, which drops equations and a
 * picture's size: each equation becomes a numbered mark, its LaTeX kept
 * apart, and each picture's description carries its size on the page.
 */
export function prepareDocx(bytes: Uint8Array): PreparedDocx {
  const files = unzipSync(bytes);
  const body = files["word/document.xml"];
  if (!body) return { docx: bytes, formulas: [] };
  const xml = new DOMParser().parseFromString(
    strFromU8(body),
    "application/xml",
  );
  const formulas: Formula[] = [];
  // A tag's collection is live and shrinks as its elements are replaced, so
  // each loop walks a copy taken first.
  for (const shown of Array.from(xml.getElementsByTagName("m:oMathPara"))) {
    const marks = [...shown.getElementsByTagName("m:oMath")].map((math) => {
      formulas.push({ latex: ommlToLatex(math), block: true });
      return markRun(xml, formulas.length - 1);
    });
    shown.replaceWith(...marks);
  }
  for (const math of Array.from(xml.getElementsByTagName("m:oMath"))) {
    formulas.push({ latex: ommlToLatex(math), block: false });
    math.replaceWith(markRun(xml, formulas.length - 1));
  }
  const page = textWidth(xml);
  for (const drawing of [
    ...xml.getElementsByTagName("wp:inline"),
    ...xml.getElementsByTagName("wp:anchor"),
  ]) {
    const width = Number(
      drawing.getElementsByTagName("wp:extent")[0]?.getAttribute("cx"),
    );
    const described = drawing.getElementsByTagName("wp:docPr")[0];
    if (!described || !(width > 0)) continue;
    const words =
      described.getAttribute("descr")?.trim() ||
      described.getAttribute("title")?.trim() ||
      "";
    described.setAttribute(
      "descr",
      `${words}${SIZE_MARK}${sizeOfShare(width / page)}`,
    );
  }
  files["word/document.xml"] = strToU8(
    new XMLSerializer().serializeToString(xml),
  );
  return { docx: zipSync(files), formulas };
}

/** A picture's description and the size it had in Word, as the reader passed them on. */
export function sizedDescription(described: string | undefined): {
  alt: string;
  size: ImageSize | null;
} {
  const [alt = "", size] = (described ?? "").split(SIZE_MARK);
  return {
    alt: alt.trim(),
    size:
      size === "small" ||
      size === "medium" ||
      size === "large" ||
      size === "full"
        ? size
        : null,
  };
}

const attribute = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

/** The read HTML with each equation's mark put back as the editor's formula. */
export function formulasInPlace(html: string, formulas: Formula[]): string {
  return html.replaceAll(FORMULA, (mark, index: string) => {
    const formula = formulas[Number(index)];
    return formula
      ? `<span data-latex="${attribute(formula.latex)}"${formula.block ? " data-block" : ""}></span>`
      : mark;
  });
}
