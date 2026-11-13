import { SECTION_SPECS } from "@faridalms/domain/site-sections";
import { describe, expect, it } from "vitest";

import { itemTitle } from "./item-title";

const picture = (alt: string) => ({ fileId: "f", alt });

describe("itemTitle", () => {
  it("names a card by its title before its other words", () => {
    expect(
      itemTitle(
        { id: "1", title: "Sport", text: "Twelve teams and a pool." },
        SECTION_SPECS.cards.fields.items.fields,
      ),
    ).toBe("Sport");
  });

  it("names a voice by the person before the quote", () => {
    expect(
      itemTitle(
        { id: "1", quote: "A school that listens.", name: "Salama Ashoush" },
        SECTION_SPECS.voices.fields.items.fields,
      ),
    ).toBe("Salama Ashoush");
  });

  it("names a fee by its label and a timeline entry by its title", () => {
    expect(
      itemTitle(
        { id: "1", label: "Tuition", value: "EGP 90,000", note: "" },
        SECTION_SPECS.fees.fields.items.fields,
      ),
    ).toBe("Tuition");
    expect(
      itemTitle(
        { id: "1", year: "1998", title: "Founded", text: "" },
        SECTION_SPECS.timeline.fields.items.fields,
      ),
    ).toBe("Founded");
  });

  it("takes the first words when nothing names the item", () => {
    expect(
      itemTitle(
        {
          id: "1",
          quote:
            "Our daughter found her voice here in her very first year at the school",
          name: " ",
        },
        SECTION_SPECS.voices.fields.items.fields,
      ),
    ).toBe("Our daughter found her voice here in her…");
  });

  it("reads a slide's heading without the asterisks that mark emphasis", () => {
    expect(
      itemTitle(
        { id: "1", heading: "Learn *by doing*", eyebrow: "", text: "" },
        SECTION_SPECS.slides.fields.items.fields,
      ),
    ).toBe("Learn by doing");
  });

  it("names a picture by its description", () => {
    expect(
      itemTitle(
        { id: "1", image: picture("Pupils in the science lab") },
        SECTION_SPECS.hero.fields.more.fields,
      ),
    ).toBe("Pupils in the science lab");
  });

  it("keeps Arabic words as they are written", () => {
    expect(
      itemTitle(
        { id: "1", title: "", text: "رحلة إلى *الأقصر* مع الصف الخامس" },
        SECTION_SPECS.steps.fields.items.fields,
      ),
    ).toBe("رحلة إلى الأقصر مع الصف الخامس");
  });

  it("is null for an item still empty", () => {
    expect(
      itemTitle(
        { id: "1", image: picture("") },
        SECTION_SPECS.gallery.fields.items.fields,
      ),
    ).toBeNull();
    expect(
      itemTitle(
        { id: "1", title: "", text: "" },
        SECTION_SPECS.steps.fields.items.fields,
      ),
    ).toBeNull();
  });
});
