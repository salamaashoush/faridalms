import type { ContentDocument } from "@faridalms/domain/content";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ViewStrings } from "./view";

import { ContentRenderer, WholeDocumentProvider } from "./view";

const strings = {} as ViewStrings;

const english: ContentDocument = {
  root: {
    type: "root",
    version: 1,
    children: [
      {
        type: "paragraph",
        version: 1,
        children: [{ type: "text", version: 1, text: "Rivers", format: 0 }],
      },
    ],
  },
};

describe("a document's language", () => {
  it("is read from its words until its author sets one", () => {
    expect(
      renderToStaticMarkup(
        <ContentRenderer document={english} strings={strings} />,
      ),
    ).toMatch(/^<div class="fe" dir="ltr">/);
    expect(
      renderToStaticMarkup(
        <ContentRenderer document={english} strings={strings} lang="ar" />,
      ),
    ).toMatch(/^<div class="fe" lang="ar" dir="rtl">/);
  });

  it("reaches each part of a document drawn apart", () => {
    expect(
      renderToStaticMarkup(
        <WholeDocumentProvider value={{ terms: [], lang: "ar" }}>
          <ContentRenderer document={english} strings={strings} />
        </WholeDocumentProvider>,
      ),
    ).toMatch(/^<div class="fe" lang="ar" dir="rtl">/);
  });
});
