import { describe, expect, it } from "vitest";

import { plainContent } from "./content-conversion";
import { alignTranslation, translationGaps } from "./newsletters";

const first = "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b41";
const second = "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b42";
const third = "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b43";

const section = (id: string, heading: string, body = "") => ({
  id,
  heading,
  body: plainContent(body),
});

const original = {
  sections: [
    section(first, "From the principal", "Welcome back."),
    section(second, "Clubs", "Chess starts on Monday."),
    section(third, ""),
  ],
  reviewed: [],
};

describe("translation gaps", () => {
  it("counts written sections the translation lacks or nobody has checked", () => {
    expect(
      translationGaps(original, {
        sections: [section(first, "كلمة المديرة", "مرحبًا بعودتكم.")],
        reviewed: [],
      }),
    ).toEqual({ missing: [second], unreviewed: [first] });
  });

  it("ignores an empty section of the original and a checked one", () => {
    expect(
      translationGaps(original, {
        sections: [section(first, "كلمة المديرة"), section(second, "الأندية")],
        reviewed: [first, second],
      }),
    ).toEqual({ missing: [], unreviewed: [] });
  });

  it("treats a translation with nothing written as missing throughout", () => {
    expect(
      translationGaps(original, {
        sections: [section(first, "  ")],
        reviewed: [first],
      }).missing,
    ).toEqual([first, second]);
  });
});

describe("aligning a translation", () => {
  it("follows the original's order and drops sections it no longer has", () => {
    const stray = "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b49";
    const aligned = alignTranslation(original, {
      sections: [
        section(second, "الأندية"),
        section(stray, "قسم محذوف"),
        section(first, "كلمة المديرة"),
      ],
      reviewed: [stray, second],
    });
    expect(aligned.sections.map((item) => item.id)).toEqual([first, second]);
    expect(aligned.reviewed).toEqual([second]);
  });
});
