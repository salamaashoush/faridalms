import { describe, expect, it } from "vitest";

import type { FootnoteSource } from "./citations";

import { bibliographyOf } from "./bibliography";
import { formatReference, formatSource, sourceText } from "./citations";

const source = (fields: Partial<FootnoteSource>): FootnoteSource => ({
  kind: "book",
  style: "apa",
  authors: "",
  title: "",
  container: "",
  date: "",
  volume: "",
  issue: "",
  pages: "",
  url: "",
  ...fields,
});

const beloved = source({
  authors: "Morrison, Toni",
  title: "Beloved",
  container: "Knopf",
  date: "1987",
});
const article = source({
  kind: "article",
  authors: "Grady, Jessica Stoltzfus; Her, Malina; Moreno, Geena",
  title: "Emotions in storybooks",
  container: "Psychology of Popular Media Culture",
  date: "2019",
  volume: "8",
  issue: "3",
  pages: "207–217",
  url: "https://doi.org/10.1037/ppm0000185",
});
const page = source({
  kind: "web",
  authors: "Ali, Sara",
  title: "How rivers shape deltas",
  container: "Earth Notes",
  date: "2024-03-05",
  url: "https://example.com/deltas",
});

describe("citing a source", () => {
  it("writes APA 7 references, the title in italics", () => {
    expect(sourceText(beloved)).toBe("Morrison, T. (1987). Beloved. Knopf.");
    expect(formatSource(beloved).find((run) => run.italic)?.text).toBe(
      "Beloved",
    );
    expect(sourceText(article)).toBe(
      "Grady, J. S., Her, M., & Moreno, G. (2019). Emotions in storybooks. Psychology of Popular Media Culture, 8(3), 207–217. https://doi.org/10.1037/ppm0000185",
    );
    expect(sourceText(page)).toBe(
      "Ali, S. (2024, March 5). How rivers shape deltas. Earth Notes. https://example.com/deltas",
    );
    expect(sourceText(source({ title: "Untitled notes" }))).toBe(
      "(n.d.). Untitled notes.",
    );
  });

  it("writes MLA 9 entries", () => {
    expect(sourceText({ ...beloved, style: "mla" })).toBe(
      "Morrison, Toni. Beloved. Knopf, 1987.",
    );
    expect(sourceText({ ...article, style: "mla" })).toBe(
      "Grady, Jessica Stoltzfus, et al. “Emotions in storybooks.” Psychology of Popular Media Culture, vol. 8, no. 3, 2019, pp. 207–217, https://doi.org/10.1037/ppm0000185.",
    );
  });

  it("writes Chicago notes, first names first", () => {
    expect(sourceText({ ...beloved, style: "chicago", pages: "23" })).toBe(
      "Toni Morrison, Beloved (Knopf, 1987), 23.",
    );
    expect(sourceText({ ...page, style: "chicago" })).toBe(
      "Sara Ali, “How rivers shape deltas,” Earth Notes, March 5, 2024, https://example.com/deltas.",
    );
  });
});

const reference = (cited: FootnoteSource) =>
  formatReference(cited)
    .map((run) => run.text)
    .join("");

describe("a reference list", () => {
  it("writes Chicago's bibliography, the first author last name first", () => {
    expect(reference({ ...beloved, style: "chicago", pages: "23" })).toBe(
      "Morrison, Toni. Beloved. Knopf, 1987.",
    );
    expect(reference({ ...article, style: "chicago" })).toBe(
      "Grady, Jessica Stoltzfus, Malina Her, and Geena Moreno. “Emotions in storybooks.” Psychology of Popular Media Culture 8, no. 3 (2019): 207–217. https://doi.org/10.1037/ppm0000185.",
    );
    expect(reference({ ...page, style: "chicago" })).toBe(
      "Ali, Sara. “How rivers shape deltas.” Earth Notes. March 5, 2024. https://example.com/deltas.",
    );
    // APA and MLA list a source as their notes already give it.
    expect(reference(beloved)).toBe(sourceText(beloved));
  });

  it("lists each source once by its first author, named for the style most use", () => {
    const list = bibliographyOf(
      [
        { ...beloved, pages: "23" },
        { ...article, style: "mla" },
        { ...beloved, pages: "40" },
        page,
        source({ title: "" }),
      ],
      "en",
    );
    expect(list?.style).toBe("apa");
    expect(
      list?.entries.map((runs) => runs.map((run) => run.text).join("")),
    ).toEqual([
      sourceText(page),
      sourceText({ ...article, style: "mla" }),
      sourceText(beloved),
    ]);
    expect(bibliographyOf([source({})], "en")).toBeNull();
  });
});
