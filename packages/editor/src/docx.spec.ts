import type { ContentDocument, ContentNode } from "@faridalms/domain/content";

import { contentDocumentSchema } from "@faridalms/domain/content";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import mammoth from "mammoth";
import { readFileSync } from "node:fs";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { formulasInPlace, prepareDocx, sizedDescription } from "./docx";
import { buildContentEditor } from "./headless";
import { STORED_FILE } from "./nodes/stored";
import { ommlToLatex } from "./omml";
import { $placeWord } from "./plugins/word";

const MATH_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const FILE_ID = "0190a1b2-0000-7000-8000-0000000000c1";

const run = (text: string) => `<m:r><m:t>${text}</m:t></m:r>`;

/** An equation's LaTeX, from its Office Math as Word writes it. */
function latex(inner: string): string {
  const xml = new DOMParser().parseFromString(
    `<m:oMath xmlns:m="${MATH_NS}">${inner}</m:oMath>`,
    "application/xml",
  );
  return ommlToLatex(xml.documentElement);
}

describe("Word's equations as LaTeX", () => {
  it("writes fractions, powers, roots and Greek letters", () => {
    expect(
      latex(`<m:f><m:num>${run("1")}</m:num><m:den>${run("2")}</m:den></m:f>`),
    ).toBe("\\frac{1}{2}");
    expect(
      latex(
        `${run("π")}<m:sSup><m:e>${run("r")}</m:e><m:sup>${run("2")}</m:sup></m:sSup>`,
      ),
    ).toBe("\\pi {r}^{2}");
    expect(
      latex(
        `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${run("x")}</m:e></m:rad>`,
      ),
    ).toBe("\\sqrt{x}");
    expect(
      latex(`<m:rad><m:deg>${run("3")}</m:deg><m:e>${run("8")}</m:e></m:rad>`),
    ).toBe("\\sqrt[3]{8}");
  });

  it("writes sums with their limits, brackets and matrices", () => {
    expect(
      latex(
        `<m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub>${run("i=1")}</m:sub><m:sup>${run("n")}</m:sup><m:e>${run("i")}</m:e></m:nary>`,
      ),
    ).toBe("\\sum_{i=1}^{n}{i}");
    expect(latex(`<m:d><m:e>${run("a+b")}</m:e></m:d>`)).toBe(
      "\\left(a+b\\right)",
    );
    expect(
      latex(
        `<m:d><m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/></m:dPr><m:e><m:m><m:mr><m:e>${run("1")}</m:e><m:e>${run("0")}</m:e></m:mr><m:mr><m:e>${run("0")}</m:e><m:e>${run("1")}</m:e></m:mr></m:m></m:e></m:d>`,
      ),
    ).toBe("\\left[\\begin{matrix}1 & 0 \\\\ 0 & 1\\end{matrix}\\right]");
  });

  it("names functions and limits, and accents a vector", () => {
    expect(
      latex(
        `<m:func><m:fName>${run("sin")}</m:fName><m:e>${run("θ")}</m:e></m:func>`,
      ),
    ).toBe("\\sin{\\theta}");
    expect(
      latex(
        `<m:func><m:fName><m:limLow><m:e>${run("lim")}</m:e><m:lim>${run("x→0")}</m:lim></m:limLow></m:fName><m:e>${run("f")}</m:e></m:func>`,
      ),
    ).toBe("\\lim_{x\\to 0}{f}");
    expect(
      latex(
        `<m:acc><m:accPr><m:chr m:val="⃗"/></m:accPr><m:e>${run("v")}</m:e></m:acc>`,
      ),
    ).toBe("\\vec{v}");
  });
});

/** The rivers fixture with an equation in a line and one shown on its own. */
function riversWithEquations(): Uint8Array {
  const files = unzipSync(
    new Uint8Array(readFileSync("packages/editor/fixtures/rivers.docx")),
  );
  const body = strFromU8(files["word/document.xml"] ?? new Uint8Array());
  files["word/document.xml"] = strToU8(
    body
      .replace("<w:document ", `<w:document xmlns:m="${MATH_NS}" `)
      .replace(
        "</w:body>",
        `<w:p><w:r><w:t xml:space="preserve">Area is </w:t></w:r><m:oMath>${run("π")}<m:sSup><m:e>${run("r")}</m:e><m:sup>${run("2")}</m:sup></m:sSup></m:oMath></w:p>` +
          `<w:p><m:oMathPara><m:oMath><m:f><m:num>${run("1")}</m:num><m:den>${run("2")}</m:den></m:f></m:oMath></m:oMathPara></w:p></w:body>`,
      ),
  );
  return zipSync(files);
}

function flat(node: ContentNode): ContentNode[] {
  return [node, ...(node.children ?? []).flatMap(flat)];
}

describe("a Word document with equations and sized pictures", () => {
  it("brings its equations in as formulas, and each picture at its size on the page", async () => {
    const { docx, formulas } = prepareDocx(riversWithEquations());
    const { value } = await mammoth.convertToHtml(
      { buffer: Buffer.from(docx) },
      {
        idPrefix: "word-",
        externalFileAccess: false,
        convertImage: mammoth.images.imgElement((image) => {
          const { alt, size } = sizedDescription(
            (image as { altText?: string }).altText,
          );
          return Promise.resolve({
            src: `${STORED_FILE}${FILE_ID}`,
            alt,
            ...(size ? { "data-size": size } : {}),
          });
        }),
      },
    );
    const editor = buildContentEditor();
    editor.update(() => $placeWord(editor, formulasInPlace(value, formulas)), {
      discrete: true,
    });
    const document = editor
      .getEditorState()
      .toJSON() as unknown as ContentDocument;
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    const nodes = flat(document.root);
    const maths = nodes.filter((node) => node.type === "math");
    expect(maths.map((node) => [node.latex, node.block ?? false])).toEqual([
      ["\\pi {r}^{2}", false],
      ["\\frac{1}{2}", true],
    ]);
    // An inch-wide picture on an A4 page reads small, its description kept.
    expect(nodes.find((node) => node.type === "image")).toMatchObject({
      alt: "A river",
      size: "small",
    });
  });
});
