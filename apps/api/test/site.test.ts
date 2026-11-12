import type { PageSection } from "@faridalms/domain/website";
import type { RouterClient } from "@orpc/server";

import { plainContent } from "@faridalms/domain/content-conversion";
import { platformName } from "@faridalms/domain/hosts";
import { newSection } from "@faridalms/domain/website";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { describe, expect, test } from "bun:test";

import type { AppRouter } from "../src/router";

import {
  client,
  DOMAINS,
  login,
  raw,
  rejection,
  seeded,
  sessionFor,
  signedIn,
} from "./harness";

const visitor = () => client("northwind").site;
const principal = () => sessionFor("northwind", login("principal"));
// A week ahead, so an event added here is still to come whenever this runs.
const ahead = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

const PIXEL = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (character) => character.charCodeAt(0),
);

const publicMedia = (key: string) =>
  seeded().handler(new Request(`http://api.test/public-media/${key}`));

describe("the public website", () => {
  test("visitors read published pages and posts in their language, never drafts", async () => {
    const site = visitor();
    const shell = await site.publicSite({ school: "northwind", locale: "ar" });
    expect(shell.locale).toBe("ar");
    // Visitors carry no school, so the site says which digits its school writes.
    expect(shell.digits).toBe("latn");
    expect(shell.menu.map((entry) => entry.title)).toEqual([
      "الرئيسية",
      "من نحن",
      "الأكاديمي",
      "القبول",
      "زُرنا",
      "أولياء الأمور",
      "تواصل معنا",
    ]);
    expect(shell.theme.id).toBe("meridian");
    expect(shell.actions.map((action) => action.label)).toEqual([
      "استفسر",
      "احجز زيارة",
      "قدّم الآن",
    ]);

    const home = await site.publicSitePage({
      school: "northwind",
      locale: "ar",
      slug: "",
    });
    const [hero] = home.sections;
    expect(hero?.section).toMatchObject({
      type: "hero",
      data: { heading: "عقول فضولية ومستقبل *عالمي*" },
    });
    expect(home.news.map((row) => row.title)).toContain("أهلًا بعودتكم");

    expect(
      await rejection(
        site.publicSitePage({
          school: "northwind",
          locale: "en",
          slug: "no-such-page",
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });

    const news = await site.publicSitePosts({
      school: "northwind",
      locale: "en",
    });
    expect(news.rows[0]?.title).toBe("Welcome back");
    expect(news.rows.map((row) => row.title)).not.toContain("Sports day");

    const fair = await site.publicSitePost({
      school: "northwind",
      locale: "ar",
      slug: "science-fair",
    });
    expect(fair.title).toBe("الفائزون في معرض العلوم");
    expect(fair.bodyLocale).toBe("ar");

    expect(
      await rejection(site.publicSite({ school: "no-such-school" })),
    ).toMatchObject({ code: "NOT_FOUND" });
  });

  test("a teacher cannot manage the website", async () => {
    const teacher = await signedIn("northwind", login("teacher"));
    expect(await rejection(teacher.site.overview())).toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("publishing a page", () => {
  test("a picture needs a description in every language, edits stay private until published, and history restores", async () => {
    const { api, token } = await principal();
    const file = await api.files.initiate({
      purpose: "document_media",
      name: "library.png",
      mediaType: "image/png",
      sizeBytes: PIXEL.byteLength,
    });
    const put = await raw("northwind", token, `/v1/files/${file.id}/content`, {
      method: "PUT",
      body: PIXEL,
    });
    expect(put.status).toBe(200);

    const { pages } = await api.site.overview();
    const about = pages.find((row) => row.slug === "about");
    if (!about) throw new Error("the seed has no about page");
    const opened = await api.site.page({ id: about.id });
    const heroId = crypto.randomUUID();
    const blank = newSection("hero");
    const hero = (alt: string, heading = "Our library"): PageSection => ({
      ...blank,
      id: heroId,
      data: {
        ...blank.data,
        heading,
        media: {
          kind: "image",
          fileId: file.id,
          alt,
          posterFileId: null,
          captionsFileId: null,
        },
      },
    });
    const save = (english: string, arabic: string, expectedVersion: number) =>
      api.site.savePage({
        id: about.id,
        expectedVersion,
        parentId: "",
        slug: "about",
        titleEn: "About us",
        titleAr: "من نحن",
        inMenu: true,
        content: {
          sections: [hero(english), ...opened.content.sections],
          description: "",
          reviewed: [],
        },
        translation: {
          sections: [
            hero(arabic, "مكتبتنا"),
            ...(opened.translation?.sections ?? []),
          ],
          description: "",
          reviewed: [],
        },
      });

    let saved = await save("", "", opened.version);
    expect(
      await rejection(
        api.site.publishPage({ id: about.id, expectedVersion: saved.version }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "site.issues" });
    const flagged = await api.site.page({ id: about.id });
    expect(flagged.issues.en).toContainEqual({
      sectionId: heroId,
      code: "alt",
    });
    expect(flagged.issues.ar).toContainEqual({
      sectionId: heroId,
      code: "alt",
    });

    saved = await save(
      "Pupils reading in the library",
      "تلاميذ يقرؤون",
      saved.version,
    );
    const published = await api.site.publishPage({
      id: about.id,
      expectedVersion: saved.version,
    });
    const page = await visitor().publicSitePage({
      school: "northwind",
      locale: "ar",
      slug: "about",
    });
    expect(page.sections[0]?.section).toMatchObject({
      data: {
        heading: "مكتبتنا",
        media: { fileId: file.id, alt: "تلاميذ يقرؤون" },
      },
    });
    const key = page.media[file.id];
    if (!key) throw new Error("the picture was not published");
    const served = await publicMedia(key);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");

    const both = await api.documents.history({
      hostType: "site_page",
      hostId: about.id,
    });
    expect(
      both.languages.toSorted((a, b) => (a ?? "").localeCompare(b ?? "")),
    ).toEqual(["ar", "en"]);
    const shownIn = new Set(
      both.versions
        .filter((row) => row.reason === "publish")
        .map((row) => row.locale),
    );
    expect(
      [...shownIn].toSorted((a, b) => (a ?? "").localeCompare(b ?? "")),
    ).toEqual(["ar", "en"]);

    const edited = await api.site.savePage({
      id: about.id,
      expectedVersion: published.version,
      parentId: "",
      slug: "about",
      titleEn: "Who we are",
      titleAr: "من نحن",
      inMenu: true,
      content: {
        sections: [hero("Pupils reading in the library")],
        description: "",
        reviewed: [],
      },
      translation: null,
    });
    const stillPublic = await visitor().publicSitePage({
      school: "northwind",
      locale: "en",
      slug: "about",
    });
    expect(stillPublic.title).toBe("About us");
    expect(stillPublic.sections.length).toBeGreaterThan(1);
    const changed = await api.site.page({ id: about.id });
    expect(changed.revisedAt).not.toBeNull();

    // The page's earlier versions come from the one history every document
    // keeps, in each language it is written in.
    const history = await api.documents.history({
      hostType: "site_page",
      hostId: about.id,
    });
    const snapshot = history.versions.find(
      (row) => row.reason === "publish" && row.locale === "en",
    );
    if (!snapshot) throw new Error("no publish snapshot");
    const brought = await api.documents.restore({
      hostType: "site_page",
      hostId: about.id,
      locale: "en",
      documentVersion: snapshot.documentVersion,
    });
    if (brought.kind !== "page") throw new Error("a page comes back as a page");
    await api.site.savePage({
      id: about.id,
      expectedVersion: changed.version,
      parentId: "",
      slug: "about",
      titleEn: "Who we are",
      titleAr: "من نحن",
      inMenu: true,
      content: brought.page,
      translation: null,
    });
    const restored = await api.site.page({ id: about.id });
    expect(restored.content.sections.length).toBe(
      opened.content.sections.length + 1,
    );

    await api.site.unpublishPage({
      id: about.id,
      expectedVersion: restored.version,
    });
    expect(
      await rejection(
        visitor().publicSitePage({
          school: "northwind",
          locale: "en",
          slug: "about",
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect((await publicMedia(key)).status).toBe(404);
    expect(edited.version).toBeGreaterThan(published.version);
  });
});

/** Every page but the one a starter recreates, as it stood. */
const untouched = (
  rows: { id: string; slug: string; state: string; version: number }[],
) =>
  rows
    .filter((row) => row.slug !== "visit")
    .map((row) => [row.id, row.state, row.version]);

describe("starting from a starter", () => {
  test("adds the starter's missing pages as drafts in both languages and takes its theme", async () => {
    const { api } = await principal();
    const before = await api.site.overview();
    const visitBefore = before.pages.find((row) => row.slug === "visit");
    if (!visitBefore) throw new Error("no seeded visit page");
    await api.site.removeSitePage({ id: visitBefore.id });
    const { created } = await api.site.applyStarter({
      starter: "heritage",
      withTheme: true,
    });
    expect(created).toHaveLength(1);
    const after = await api.site.overview();
    const visit = after.pages.find((row) => row.slug === "visit");
    expect(visit?.state).toBe("draft");
    expect(untouched(after.pages)).toEqual(untouched(before.pages));
    expect(after.settings.theme.id).toBe("heritage");
    if (!visit) throw new Error("no visit page");
    const page = await api.site.page({ id: visit.id });
    expect(page.content.sections.length).toBeGreaterThan(0);
    expect(page.gaps.missing).toEqual([]);
    // Other files read Northwind's seeded theme, so it goes back as it was.
    await api.site.saveSettings({
      expectedVersion: after.settings.version,
      theme: before.settings.theme,
      chrome: after.settings.chrome,
      live: after.settings.live,
      bilingual: after.settings.bilingual,
      taglineEn: after.settings.taglineEn,
      taglineAr: after.settings.taglineAr,
      socialLinks: after.settings.socialLinks,
      bannerEn: after.settings.bannerEn,
      bannerAr: after.settings.bannerAr,
      bannerTone: after.settings.bannerTone,
      bannerUntil: after.settings.bannerUntil ?? "",
    });
  });
});

/** A visitor whose requests arrive through the web server from one address. */
function visitorFrom(address: string) {
  const { handler } = seeded();
  const api: RouterClient<AppRouter> = createORPCClient(
    new RPCLink({
      url: "http://api.test/rpc",
      headers: () => ({ "x-forwarded-for": address }),
      fetch: (request, init) => handler(new Request(request, init)),
    }),
  );
  return api.site;
}

describe("website enquiries", () => {
  test("arrive from a published form, drop what a script sent, and slow a flood", async () => {
    const page = await visitor().publicSitePage({
      school: "northwind",
      locale: "en",
      slug: "admissions",
    });
    const form = page.sections.find((item) => item.section.type === "form");
    if (!form) throw new Error("no form on the admissions page");
    const base = {
      school: "northwind",
      locale: "en" as const,
      page: "admissions",
      sectionId: form.section.id,
      name: "Salama Ashoush",
      email: "salama@example.com",
      phone: "",
      childYear: "Grade 3",
      message: "Could we visit on Thursday?",
      website: "",
      elapsed: 9000,
    };
    const site = visitorFrom("203.0.113.7");
    expect(await site.submitEnquiry(base)).toEqual({ received: true });
    expect(
      await site.submitEnquiry({ ...base, name: "Robot", website: "spam" }),
    ).toEqual({ received: true });
    expect(
      await site.submitEnquiry({ ...base, name: "Too fast", elapsed: 300 }),
    ).toEqual({ received: true });
    expect(
      await rejection(
        site.submitEnquiry({ ...base, sectionId: crypto.randomUUID() }),
      ),
    ).toMatchObject({ message: "site.form" });

    for (let sent = 1; sent < 5; sent += 1)
      await site.submitEnquiry({ ...base, name: `Parent ${sent}` });
    expect(
      await rejection(site.submitEnquiry({ ...base, name: "One too many" })),
    ).toMatchObject({ message: "site.too_many" });
    expect(
      await visitorFrom("198.51.100.4").submitEnquiry({
        ...base,
        name: "Another family",
      }),
    ).toEqual({ received: true });

    const { api } = await principal();
    const open = await api.admissions.enquiries({ state: "open" });
    const names = open.rows.map((row) => row.name);
    expect(names).toContain("Salama Ashoush");
    expect(names).toContain("Another family");
    expect(names).not.toContain("Robot");
    expect(names).not.toContain("Too fast");
    expect(names).not.toContain("One too many");
    const first = open.rows.find(
      (row) => row.name === "Salama Ashoush" && row.childYear === "Grade 3",
    );
    expect(first).toMatchObject({
      source: "website",
      purpose: "enquiry",
      state: "open",
      email: "salama@example.com",
    });
    if (!first) throw new Error("no enquiry");
    expect(await api.admissions.enquiry({ id: first.id })).toMatchObject({
      pageTitleEn: "Admissions",
      message: "Could we visit on Thursday?",
    });
  });
});

function listing(): PageSection {
  const blank = newSection("events");
  return {
    ...blank,
    id: "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3c01",
    data: { ...blank.data, heading: "Coming up", source: "calendar", count: 6 },
  };
}

const contactPage = () =>
  visitor().publicSitePage({
    school: "northwind",
    locale: "ar",
    slug: "contact",
  });

describe("events on the website", () => {
  test("an events section lists the calendar's public published events in the visitor's language", async () => {
    const { api } = await principal();
    const { pages, events } = await api.site.overview();
    expect(events.some((row) => row.titleEn === "Staff meeting")).toBe(false);
    const contact = pages.find((row) => row.slug === "contact");
    if (!contact) throw new Error("the seed has no contact page");
    const opened = await api.site.page({ id: contact.id });
    const saved = await api.site.savePage({
      id: contact.id,
      expectedVersion: opened.version,
      parentId: "",
      slug: "contact",
      titleEn: opened.titleEn,
      titleAr: opened.titleAr,
      inMenu: true,
      content: {
        ...opened.content,
        sections: [...opened.content.sections, listing()],
      },
      translation: {
        sections: [
          ...(opened.translation?.sections ?? []),
          { ...listing(), data: { ...listing().data, heading: "قريبًا" } },
        ],
        description: "",
        reviewed: [],
      },
    });
    await api.site.publishPage({
      id: contact.id,
      expectedVersion: saved.version,
    });

    const draft = await api.calendar.save({
      id: "",
      expectedVersion: 0,
      titleEn: "Open morning",
      titleAr: "صباح مفتوح",
      category: "general",
      startsOn: ahead,
      endsOn: ahead,
      allDay: true,
      startTime: "",
      endTime: "",
      location: "Main hall",
      provisional: false,
      audiences: [{ scope: "school", classId: "", targetId: "" }],
      description: plainContent(""),
      public: true,
    });
    const before = await contactPage();
    expect(before.events.map((row) => row.titleAr)).toContain("اليوم الرياضي");
    expect(before.events.some((row) => row.id === draft.id)).toBe(false);

    await api.calendar.publish({
      id: draft.id,
      expectedVersion: draft.version,
      notify: false,
    });
    const after = await contactPage();
    expect(after.events.find((row) => row.id === draft.id)).toMatchObject({
      titleAr: "صباح مفتوح",
      location: "Main hall",
    });
  });
});

const follow = (path: string) =>
  visitor().publicSiteRedirect({ school: "northwind", path });

describe("search engines and old addresses", () => {
  test("a page names its social picture, own address and languages, and one kept out of search leaves the sitemap", async () => {
    const { api, token } = await principal();
    const file = await api.files.initiate({
      purpose: "document_media",
      name: "families.png",
      mediaType: "image/png",
      sizeBytes: PIXEL.byteLength,
    });
    const put = await raw("northwind", token, `/v1/files/${file.id}/content`, {
      method: "PUT",
      body: PIXEL,
    });
    expect(put.status).toBe(200);
    const { pages } = await api.site.overview();
    const parents = pages.find((row) => row.slug === "parents");
    if (!parents) throw new Error("the seed has no parents page");
    const opened = await api.site.page({ id: parents.id });
    expect(opened.warnings).toEqual([
      { locale: "en", code: "description" },
      { locale: "ar", code: "description" },
    ]);
    const fields = {
      id: parents.id,
      parentId: "",
      slug: "parents",
      titleEn: opened.titleEn,
      titleAr: opened.titleAr,
      inMenu: true,
    };
    const saved = await api.site.savePage({
      ...fields,
      expectedVersion: opened.version,
      content: {
        ...opened.content,
        description: "For families",
        socialPicture: { fileId: file.id, alt: "Families at the gate" },
        canonical: "https://example.org/parents",
      },
      translation: opened.translation && {
        ...opened.translation,
        description: "للأسر",
      },
    });
    const described = await api.site.page({ id: parents.id });
    expect(described.warnings).toEqual([]);
    await api.site.publishPage({
      id: parents.id,
      expectedVersion: saved.version,
    });

    const read = (locale: "en" | "ar") =>
      visitor().publicSitePage({
        school: "northwind",
        locale,
        slug: parents.slug,
      });
    const english = await read("en");
    expect(english).toMatchObject({
      path: "/pages/parents",
      locales: ["en", "ar"],
      indexed: true,
      canonical: "https://example.org/parents",
      socialPicture: { alt: "Families at the gate" },
    });
    expect(english.socialPicture?.key).toBe(english.media[file.id]);
    const arabic = await read("ar");
    // The other language shows the first's picture and is its own address.
    expect(arabic).toMatchObject({ description: "للأسر", canonical: "" });
    expect(arabic.socialPicture?.key).toBe(english.socialPicture?.key);

    const listed = await visitor().publicSitemap({ school: "northwind" });
    expect(listed.siteHost).toBe(platformName("northwind", "site", DOMAINS));
    expect(listed.primaryLocale).toBe("en");
    const entry = listed.entries.find((row) => row.path === "/pages/parents");
    expect(entry?.locales.map((row) => row.locale).toSorted()).toEqual([
      "ar",
      "en",
    ]);
    expect(listed.entries.map((row) => row.path)).toContain(
      "/news/welcome-back",
    );
    expect(listed.entries.map((row) => row.path)).not.toContain(
      "/news/sports-day",
    );

    const current = await api.site.page({ id: parents.id });
    const hidden = await api.site.savePage({
      ...fields,
      expectedVersion: current.version,
      indexed: false,
      content: current.content,
      translation: current.translation,
    });
    expect((await read("en")).indexed).toBe(true);
    await api.site.publishPage({
      id: parents.id,
      expectedVersion: hidden.version,
    });
    expect((await read("en")).indexed).toBe(false);
    const after = await visitor().publicSitemap({ school: "northwind" });
    expect(after.entries.map((row) => row.path)).not.toContain(
      "/pages/parents",
    );
  });

  test("an old address leads on to a published page through its renames, or to another address", async () => {
    const { api } = await principal();
    const { pages } = await api.site.overview();
    const academics = pages.find((row) => row.slug === "academics");
    if (!academics) throw new Error("the seed has no academics page");
    const created = await api.site.saveSiteRedirect({
      id: "",
      expectedVersion: 0,
      from: "/Old-Academics.html",
      toPageId: academics.id,
      toUrl: "",
    });
    expect(await follow("/old-academics.html/?from=search")).toEqual({
      to: "/pages/academics",
    });
    expect(await follow("/nothing-here")).toEqual({ to: null });
    expect(await follow("/")).toEqual({ to: null });

    expect(
      await rejection(
        api.site.saveSiteRedirect({
          id: "",
          expectedVersion: 0,
          from: "/old-academics.html",
          toPageId: "",
          toUrl: "https://example.org",
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "site.redirect_taken" });
    const [listed] = await api.site.redirects();
    expect(listed).toMatchObject({
      fromPath: "/old-academics.html",
      toPageId: academics.id,
      toUrl: null,
    });
    expect(listed?.createdBy.en).toBeTruthy();

    const moved = await api.site.saveSiteRedirect({
      id: created.id,
      expectedVersion: created.version,
      from: "/old-academics.html",
      toPageId: "",
      toUrl: "https://example.org/learning",
    });
    expect(await follow("/old-academics.html")).toEqual({
      to: "https://example.org/learning",
    });

    // A page nobody has published leads nowhere yet.
    const draft = await api.site.savePage({
      id: "",
      expectedVersion: 0,
      parentId: "",
      slug: "sixth-form",
      titleEn: "Sixth form",
      titleAr: "",
      inMenu: false,
      content: { sections: [], description: "" },
      translation: null,
    });
    await api.site.saveSiteRedirect({
      id: "",
      expectedVersion: 0,
      from: "/sixth",
      toPageId: draft.id,
      toUrl: "",
    });
    expect(await follow("/sixth")).toEqual({ to: null });

    await api.site.removeSiteRedirect({
      id: moved.id,
      expectedVersion: moved.version,
    });
    expect(await follow("/old-academics.html")).toEqual({ to: null });

    const teacher = await signedIn("northwind", login("teacher"));
    expect(await rejection(teacher.site.redirects())).toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
