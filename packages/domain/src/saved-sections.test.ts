import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { PageSection } from "./site-sections";

import {
  resolveSharedSections,
  savedSectionOf,
  savedSectionSchema,
  sectionPair,
  sharedSectionIds,
  withFreshIds,
  withoutSections,
} from "./saved-sections";
import { buildSection } from "./site-templates";
import { blankPage } from "./website";

const SHARED = "0190f1d4-0000-7000-8000-000000000001";

const headingOf = (section: PageSection) =>
  (section.data as { heading?: string }).heading;

const itemsOf = (section: PageSection | null) =>
  (section?.data as { items?: { id: string }[] } | undefined)?.items?.map(
    (item) => item.id,
  ) ?? [];

describe("a saved section", () => {
  it("is kept in both languages, without naming a shared section", () => {
    const built = buildSection("text", "narrow", "en");
    const saved = savedSectionOf(
      { ...built.content, shared: SHARED },
      built.translation,
      "en",
    );
    expect(saved.section.shared).toBeUndefined();
    expect(v.is(savedSectionSchema, saved)).toBe(true);
    expect(
      v.is(savedSectionSchema, {
        ...saved,
        translation: { ...built.translation, id: crypto.randomUUID() },
      }),
    ).toBe(false);
  });

  it("turns round for a site whose first language is the other one", () => {
    const built = buildSection("text", "narrow", "en");
    const saved = savedSectionOf(built.content, built.translation, "en");
    const pair = sectionPair(saved, "ar");
    expect(headingOf(pair.content)).toBe(headingOf(built.translation));
    expect(pair.translation && headingOf(pair.translation)).toBe(
      headingOf(built.content),
    );
    expect(sectionPair(saved, "en").content).toEqual(saved.section);
  });

  it("starts a copy with new ids, the same in both languages", () => {
    const built = buildSection("cards", "grid", "en");
    const fresh = withFreshIds(built.content, built.translation);
    expect(fresh.content.id).not.toBe(built.content.id);
    expect(fresh.translation?.id).toBe(fresh.content.id);
    expect(itemsOf(fresh.content)).toEqual(itemsOf(fresh.translation));
    expect(itemsOf(fresh.content)).not.toEqual(itemsOf(built.content));
  });
});

describe("a page showing shared sections", () => {
  it("draws each as it stands, under the page's own id, and lists those gone", () => {
    const own = buildSection("text", "narrow", "en");
    const kept = buildSection("text", "narrow", "en");
    const gone = buildSection("text", "narrow", "en");
    const placed = {
      ...own.content,
      id: crypto.randomUUID(),
      shared: SHARED,
    } as PageSection;
    const lost = {
      ...gone.content,
      shared: crypto.randomUUID(),
    } as PageSection;
    const content = blankPage([own.content, placed, lost]);
    const translation = blankPage([own.translation]);
    expect(sharedSectionIds(content)).toEqual([SHARED, lost.shared]);

    const resolved = resolveSharedSections(
      content,
      translation,
      new Map([[SHARED, savedSectionOf(kept.content, kept.translation, "en")]]),
      "en",
    );
    const shown = resolved.content.sections[1];
    expect(shown?.id).toBe(placed.id);
    expect(shown?.shared).toBe(SHARED);
    expect(shown && headingOf(shown)).toBe(headingOf(kept.content));
    expect(resolved.translation?.sections.map((section) => section.id)).toEqual(
      [own.translation.id, placed.id],
    );
    expect(resolved.gone).toEqual([lost.id]);

    const left = withoutSections(
      resolved.content,
      resolved.translation,
      resolved.gone,
    );
    expect(left.content.sections.map((section) => section.id)).toEqual([
      own.content.id,
      placed.id,
    ]);
  });
});
