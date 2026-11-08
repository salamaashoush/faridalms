import * as v from "valibot";
import { describe, expect, it } from "vitest";

import {
  commonsFile,
  commonsPicture,
  commonsResults,
  commonsSearchUrl,
  commonsThumb,
  creditText,
  freeLicence,
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

describe("pictures a school may not reuse", () => {
  it("are refused when non-commercial, unchangeable or held under fair use", () => {
    for (const refused of [
      { ...giza, LicenseShortName: { value: "CC BY-NC-SA 4.0" } },
      { ...giza, License: { value: "cc-by-nd-4.0" } },
      { ...giza, NonFree: { value: "true" } },
      { ...giza, LicenseShortName: { value: "Fair use" } },
    ])
      expect(commonsPicture(answer(refused), "en")).toBeNull();
    expect(
      commonsPicture(
        answer({
          ...giza,
          License: { value: "cc0" },
          LicenseShortName: { value: "CC0" },
        }),
        "en",
      ),
    ).not.toBeNull();
    expect(
      freeLicence({ License: "pd", LicenseShortName: "Public domain" }),
    ).toBe(true);
  });
});

const found = (title: string, index: number, licence: string) => ({
  ...answer({ ...giza, LicenseShortName: { value: licence } }).query.pages[0],
  title,
  index,
});

describe("a search of Wikimedia Commons", () => {
  it("asks for photographs and drawings among the files, with their credit", () => {
    const url = new URL(commonsSearchUrl("camel", "ar", 30));
    expect(url.origin).toBe("https://commons.wikimedia.org");
    expect(url.searchParams.get("generator")).toBe("search");
    expect(url.searchParams.get("gsrnamespace")).toBe("6");
    expect(url.searchParams.get("gsrsearch")).toBe(
      "camel filetype:bitmap|drawing",
    );
    expect(url.searchParams.get("iiextmetadatafilter")).toContain("Artist");
    expect(url.searchParams.get("iiextmetadatalanguage")).toBe("ar");
  });

  it("keeps the found pictures in the order it ranked them, leaving out those not free", () => {
    const results = commonsResults(
      {
        query: {
          pages: [
            found("File:Second.jpg", 2, "CC BY 4.0"),
            found("File:Kept back.jpg", 1, "CC BY-NC 2.0"),
            found("File:First.jpg", 0, "CC BY-SA 3.0"),
          ],
        },
      },
      "en",
    );
    expect(results.map((picture) => picture.title)).toEqual([
      "File:First.jpg",
      "File:Second.jpg",
    ]);
    expect(commonsResults({ batchcomplete: true }, "en")).toEqual([]);
  });

  it("shows a smaller copy of a picture to choose from", () => {
    expect(
      commonsThumb(
        "https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/X.jpg/1280px-X.jpg",
      ),
    ).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/X.jpg/330px-X.jpg",
    );
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
