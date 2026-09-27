import { describe, expect, it } from "vitest";

import type { PageContent, PageSection } from "./website";

import { plainContent } from "./content-conversion";
import {
  alignTranslation,
  isSiteHref,
  localizedSections,
  pageIssues,
  translationGaps,
} from "./website";

const hero = "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b41";
const cards = "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b42";
const item = "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b43";
const picture = "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b44";
const text = "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b45";

const english: PageContent = {
  sections: [
    {
      id: hero,
      type: "hero",
      heading: "Welcome",
      text: "",
      image: { fileId: picture, alt: "The front gate" },
      actionLabel: "Apply now",
      actionHref: "/pages/admissions",
    },
    {
      id: cards,
      type: "cards",
      heading: "Explore",
      items: [
        {
          id: item,
          title: "Clubs",
          text: "After school",
          image: { fileId: null, alt: "" },
          href: "/pages/clubs",
        },
      ],
    },
  ],
  reviewed: [],
};

describe("the other language of a page", () => {
  it("keeps the original's pictures and links and takes only the words", () => {
    const arabic: PageContent = {
      sections: [
        {
          id: hero,
          type: "hero",
          heading: "أهلًا",
          text: "",
          image: { fileId: null, alt: "البوابة" },
          actionLabel: "قدّم الآن",
          actionHref: "https://elsewhere.example.com",
        },
      ],
      reviewed: [hero, cards],
    };
    const aligned = alignTranslation(english, arabic);
    expect(aligned.sections).toEqual([
      {
        ...english.sections[0],
        heading: "أهلًا",
        actionLabel: "قدّم الآن",
        image: { fileId: picture, alt: "البوابة" },
      },
    ]);
    expect(aligned.reviewed).toEqual([hero]);
    expect(translationGaps(english, aligned)).toEqual({
      missing: [cards],
      unreviewed: [],
    });
  });

  it("shows a missing section in the original language, marked with it", () => {
    const shown = localizedSections(
      english,
      { sections: [english.sections[0] as PageSection], reviewed: [] },
      "en",
      "ar",
    );
    expect(shown.map((entry) => entry.locale)).toEqual(["ar", "en"]);
  });
});

describe("checks before publishing", () => {
  it("wants a description for every picture and words that say where a link goes", () => {
    const sections: PageSection[] = [
      {
        id: hero,
        type: "hero",
        heading: "",
        text: "",
        image: { fileId: picture, alt: " " },
        actionLabel: "Click here",
        actionHref: "/pages/admissions",
      },
      {
        id: text,
        type: "text",
        heading: "",
        body: plainContent("Fine words"),
      },
    ];
    expect(pageIssues(sections)).toEqual([
      { sectionId: hero, code: "alt" },
      { sectionId: hero, code: "link" },
    ]);
  });

  it("accepts paths inside the site and safe addresses, nothing else", () => {
    expect(isSiteHref("/pages/about")).toBe(true);
    expect(isSiteHref("https://example.com/a")).toBe(true);
    expect(isSiteHref("javascript:alert(1)")).toBe(false);
    expect(isSiteHref("/Pages/../x")).toBe(false);
  });
});
