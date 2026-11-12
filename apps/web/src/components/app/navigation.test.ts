import type { Capability } from "@faridalms/domain/capabilities";
import type { ModuleId } from "@faridalms/domain/modules";

import { BUILTIN_CAPABILITIES } from "@faridalms/domain/capabilities";
import { MODULE_IDS } from "@faridalms/domain/modules";
import { describe, expect, it } from "vitest";

import { ADMISSIONS_NAV } from "~/components/admissions/contributions";
import { MODULE_FILLINGS } from "~/extensions";
import { filled } from "~/utils/extension";
import { pageOn } from "~/utils/pages";

import type { NavItem, Viewer } from "./navigation";

import {
  arrange,
  firstPageOf,
  navigationOf,
  navItems,
  pagesOf,
  shows,
} from "./navigation";

const everyModule = Object.fromEntries(
  MODULE_IDS.map((module) => [module, true]),
) as Record<ModuleId, boolean>;

const viewer = (capabilities: readonly Capability[]): Viewer => ({
  capabilities,
  opens: (path) => pageOn(MODULE_FILLINGS, everyModule, path),
});

/** The staff workspace's sections at a school with every module on. */
const STAFF = navigationOf(
  "staff",
  filled(MODULE_FILLINGS, everyModule, navItems),
);

/** The staff sections as one person sees them: links in view, then folded. */
function sidebarOf(person: Viewer) {
  return STAFF.map((section) => {
    const visible = section.items.filter((item) => shows(item, person));
    const { items, more } = arrange(visible);
    return {
      id: section.id,
      items: items.map((item) => item.to),
      more: more.map((item) => item.to),
    };
  });
}

const count = (sections: ReturnType<typeof sidebarOf>) =>
  sections.reduce((sum, section) => sum + section.items.length, 0);

describe("the staff sidebar", () => {
  it("folds an administrator's occasional pages under More", () => {
    const sections = sidebarOf(viewer(BUILTIN_CAPABILITIES.site_administrator));
    expect(count(sections)).toBe(18);
    expect(sections.find((section) => section.id === "teaching")?.more).toEqual(
      [],
    );
    expect(sections.find((section) => section.id === "school")).toEqual({
      id: "school",
      items: ["/templates", "/settings"],
      more: [
        "/website",
        "/academic-years",
        "/billing",
        "/privacy",
        "/notification-audit",
      ],
    });
  });

  it("keeps a teacher's sections whole", () => {
    const sections = sidebarOf(viewer(BUILTIN_CAPABILITIES.teacher));
    expect(sections.every((section) => section.more.length === 0)).toBe(true);
    expect(sections.flatMap((section) => section.items)).toContain(
      "/standards",
    );
  });

  it("loses no destination: every page is in view, under More or an area", () => {
    const admin = viewer(BUILTIN_CAPABILITIES.site_administrator);
    const offered = STAFF.flatMap((section) => section.items).flatMap(
      (item: NavItem) =>
        [item.to].concat(pagesOf(item, admin).map((page) => page.to)),
    );
    for (const path of [
      "/admissions/enquiries",
      "/admissions/applications",
      "/admissions/intakes",
      "/admissions/reports",
      "/admissions/letters",
      "/templates",
      "/media",
    ])
      expect(offered).toContain(path);
  });
});

describe("an area's link", () => {
  it("lands on the first of its pages the person may open", () => {
    expect(
      firstPageOf(ADMISSIONS_NAV, viewer(BUILTIN_CAPABILITIES.principal)),
    ).toBe("/admissions/enquiries");
    expect(firstPageOf(ADMISSIONS_NAV, viewer(["admissions:configure"]))).toBe(
      "/admissions/intakes",
    );
    expect(firstPageOf(ADMISSIONS_NAV, viewer(["people:read"]))).toBe(
      undefined,
    );
  });

  it("offers the media only to those who put pictures in what they write", () => {
    const library = STAFF.flatMap((section) => section.items).find(
      (item) => item.to === "/templates",
    );
    if (!library) throw new Error("The Library area is not in the navigation");
    expect(
      pagesOf(library, viewer(["admissions:configure"])).map((page) => page.to),
    ).toEqual(["/templates"]);
    expect(
      pagesOf(library, viewer(["learning:author"])).map((page) => page.to),
    ).toEqual(["/templates", "/media"]);
  });
});

describe("arrange", () => {
  it("never folds a single link, which would cost as much as showing it", () => {
    const items = [
      { to: "a" },
      { to: "b" },
      { to: "c" },
      { to: "d" },
      { to: "e" },
      { to: "f", more: true as const },
    ];
    expect(arrange(items)).toEqual({ items, more: [] });
  });
});
