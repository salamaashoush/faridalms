import * as v from "valibot";
import { describe, expect, it } from "vitest";

import {
  commonsFile,
  commonsPicture,
  creditText,
  pictureCreditSchema,
} from "./commons";

const answer = (extmetadata: Record<string, unknown>, image?: string) => ({
  query: {
    pages: [
      {
        title: "File:All Gizah Pyramids.jpg",
        imageinfo: [
          {
            url: "https://upload.wikimedia.org/wikipedia/commons/a/af/All_Gizah_Pyramids.jpg",
            thumburl:
              image ??
              "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/af/All_Gizah_Pyramids.jpg/1920px-All_Gizah_Pyramids.jpg",
            descriptionurl:
              "https://commons.wikimedia.org/wiki/File:All_Gizah_Pyramids.jpg",
            extmetadata,
          },
        ],
      },
    ],
  },
});

const giza = {
  ObjectName: { value: "All Gizah Pyramids" },
  ImageDescription: {
    value: {
      ar: '<a href="https://ar.wikipedia.org/wiki/x" title="ar:أهرامات الجيزة">أهرامات الجيزة</a>، مصر',
      en: "All Giza Pyramids in one shot.",
      de: "Alle Pyramiden von Gizeh auf einem Bild.",
    },
  },
  Artist: {
    value:
      '<a rel="nofollow" class="external text" href="http://liberato.org">Ricardo Liberato</a>',
  },
  LicenseShortName: { value: "CC BY-SA 2.0" },
  LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/2.0" },
};

describe("a picture from Wikimedia Commons", () => {
  it("finds the file a Commons, Wikipedia or upload link points to", () => {
    const commons = "https://commons.wikimedia.org/w/api.php";
    expect(
      commonsFile(
        "https://commons.wikimedia.org/wiki/File:Nile_River_and_delta_from_orbit.jpg",
      ),
    ).toEqual({
      api: commons,
      title: "File:Nile River and delta from orbit.jpg",
    });
    expect(
      commonsFile(
        "https://en.wikipedia.org/wiki/Giza_pyramid_complex#/media/File:All_Gizah_Pyramids.jpg",
      ),
    ).toEqual({
      api: "https://en.wikipedia.org/w/api.php",
      title: "File:All Gizah Pyramids.jpg",
    });
    expect(
      commonsFile(
        "https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/All_Gizah_Pyramids.jpg/800px-All_Gizah_Pyramids.jpg",
      ),
    ).toEqual({ api: commons, title: "File:All Gizah Pyramids.jpg" });
    expect(commonsFile("https://example.com/wiki/File:Fake.jpg")).toBeNull();
    expect(commonsFile("https://en.wikipedia.org/wiki/Nile")).toBeNull();
  });

  it("keeps the author and licence its page gives, and describes it in the reader's language", () => {
    const arabic = commonsPicture(answer(giza), "ar");
    expect(arabic).toMatchObject({
      alt: "أهرامات الجيزة، مصر",
      credit: {
        author: "Ricardo Liberato",
        licence: "CC BY-SA 2.0",
        licenceUrl: "https://creativecommons.org/licenses/by-sa/2.0",
        source:
          "https://commons.wikimedia.org/wiki/File:All_Gizah_Pyramids.jpg",
      },
    });
    expect(commonsPicture(answer(giza), "en")?.alt).toBe(
      "All Giza Pyramids in one shot.",
    );
    expect(arabic && creditText(arabic.credit)).toBe(
      "Ricardo Liberato · CC BY-SA 2.0 · Wikimedia Commons",
    );
  });

  it("names a picture described only in other languages by its title", () => {
    expect(
      commonsPicture(
        answer({
          ...giza,
          ImageDescription: { value: { uk: "Супутниковий знімок" } },
        }),
        "en",
      )?.alt,
    ).toBe("All Gizah Pyramids");
  });

  it("refuses a picture with no licence to keep, or served from elsewhere", () => {
    const { LicenseShortName: _licence, ...unlicensed } = giza;
    expect(commonsPicture(answer(unlicensed), "en")).toBeNull();
    expect(
      commonsPicture(
        answer(giza, "https://evil.example.com/pyramids.jpg"),
        "en",
      ),
    ).toBeNull();
    expect(
      commonsPicture({ query: { pages: [{ missing: true }] } }, "en"),
    ).toBeNull();
  });
});

describe("a credit a teacher writes for a picture of their own", () => {
  it("may name only who took it, and reads as just that", () => {
    const credit = { author: "Salama Ashoush", licence: "" };
    expect(v.safeParse(pictureCreditSchema, credit).success).toBe(true);
    expect(creditText(credit)).toBe("Salama Ashoush");
  });

  it("names someone or a licence", () => {
    expect(
      v.safeParse(pictureCreditSchema, { author: " ", licence: "" }).success,
    ).toBe(false);
  });
});
