import { brandReadable, readableBrand } from "@faridalms/domain/brand";
import { SQL } from "bun";
import { describe, expect, test } from "bun:test";

import { forgetFace } from "../src/core/portal-face";
import {
  client,
  login,
  rejection,
  signedIn,
  testCell,
  withoutModules,
} from "./harness";

const SCHOOL = "acme";
const ACME = 1;

const principal = () => signedIn(SCHOOL, login("principal", ACME));

type Api = Awaited<ReturnType<typeof principal>>;

const face = (network: string) =>
  client("", undefined, "en", {
    "x-forwarded-for": network,
  }).identity.portalFace({ school: SCHOOL });

/** Saves the school's settings as they are, with this brand colour. */
async function saveBrand(api: Api, brandColour: string | undefined) {
  const profile = await api.school.profile();
  return api.school.saveProfile({
    expectedVersion: profile.version,
    nameEn: profile.nameEn ?? "",
    nameAr: profile.nameAr ?? "",
    identifier: profile.identifier ?? "",
    timeZone: profile.timeZone ?? "Asia/Dubai",
    defaultLocale: profile.defaultLocale,
    weekStart: profile.weekStart,
    weekendDays: profile.weekendDays,
    secondaryCalendar: profile.secondaryCalendar ?? "",
    phone: profile.phone ?? "",
    email: profile.email ?? "",
    ...(brandColour === undefined ? {} : { brandColour }),
  });
}

async function brandChanges(objectId: string) {
  const admin = new SQL(testCell().adminUrl);
  try {
    return (await admin.unsafe(
      `select details from audit.log
       where action = 'school.update' and object_id = $1::uuid and actor_user_id is not null
       order by occurred_at`,
      [objectId],
    )) as { details: unknown }[];
  } finally {
    await admin.close();
  }
}

const publicTheme = async () =>
  (await client("").site.publicSite({ school: SCHOOL, locale: "en" })).theme
    .palette;

describe("a school's brand colour", () => {
  test("is set in Settings, kept when left out, audited, and paints the sign-in at once", async () => {
    const api = await principal();
    const before = await api.school.profile();
    expect(before.brandColour).toBeNull();
    const audited = (await brandChanges(before.id)).length;

    await saveBrand(api, "#6d28d9");
    expect((await api.school.profile()).brandColour).toBe("#6D28D9");
    expect((await face("198.51.100.40")).brand).toBe("#6D28D9");
    expect((await brandChanges(before.id)).length).toBe(audited + 1);
    expect(JSON.stringify((await brandChanges(before.id)).at(-1))).toContain(
      "brand_colour",
    );

    await saveBrand(api, undefined);
    expect((await api.school.profile()).brandColour).toBe("#6D28D9");

    await saveBrand(api, "");
    expect((await api.school.profile()).brandColour).toBeNull();
    expect((await face("198.51.100.41")).brand).toBe("#0B3D91");
  });

  test("refuses a colour the sign-in's words would not read on, and one that is not a colour", async () => {
    const api = await principal();
    expect(await rejection(saveBrand(api, "#808080"))).toMatchObject({
      code: "BAD_REQUEST",
      message: "school.brand_unreadable",
    });
    expect(await rejection(saveBrand(api, "blue"))).toMatchObject({
      code: "BAD_REQUEST",
    });
    expect((await api.school.profile()).brandColour).toBeNull();
  });

  test("is set only by whoever may edit the school's settings", async () => {
    const teacher = await signedIn(SCHOOL, login("teacher", ACME));
    expect(await rejection(teacher.school.profile())).toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await rejection(saveBrand(teacher, "#6D28D9"))).toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("leads the website's main colour unless the builder sets its own", async () => {
    const api = await principal();
    const overview = await api.site.overview();
    expect(overview.school.brand).toBeNull();
    const settings = overview.settings;
    const saveTheme = (theme: typeof settings.theme, expectedVersion: number) =>
      api.site.saveSettings({
        expectedVersion,
        theme,
        chrome: settings.chrome,
        live: settings.live,
        bilingual: settings.bilingual,
        taglineEn: settings.taglineEn,
        taglineAr: settings.taglineAr,
        socialLinks: settings.socialLinks,
        bannerEn: settings.bannerEn,
        bannerAr: settings.bannerAr,
        bannerTone: settings.bannerTone,
        bannerUntil: settings.bannerUntil ?? "",
      });

    expect((await publicTheme()).primary).toBe("#0B3D91");
    await saveBrand(api, "#6D28D9");
    expect((await publicTheme()).primary).toBe("#6D28D9");
    const own = await saveTheme(
      {
        ...settings.theme,
        palette: { ...settings.theme.palette, primary: "#B91C1C" },
      },
      settings.version,
    );
    expect((await publicTheme()).primary).toBe("#B91C1C");
    expect((await face("198.51.100.44")).brand).toBe("#6D28D9");
    await saveTheme(settings.theme, own.version);
    await saveBrand(api, "");
    expect((await publicTheme()).primary).toBe("#0B3D91");
  });
});

describe("the sign-in's colour", () => {
  test("is the brand colour where set, else the website's main colour, else the platform's", async () => {
    const api = await principal();
    expect((await api.school.profile()).unsetColour).toBe("#0B3D91");
    expect((await face("198.51.100.45")).brand).toBe("#0B3D91");

    await saveBrand(api, "#6D28D9");
    expect((await face("198.51.100.46")).brand).toBe("#6D28D9");
    await withoutModules(SCHOOL, ["website"], async () => {
      forgetFace(SCHOOL);
      const shown = await face("198.51.100.47");
      expect(shown.brand).toBe("#6D28D9");
      expect(shown.websiteHost).toBeNull();
    });
    forgetFace(SCHOOL);
    await saveBrand(api, "");

    await withoutModules(SCHOOL, ["website"], async () => {
      forgetFace(SCHOOL);
      expect((await face("198.51.100.48")).brand).toBeNull();
      expect((await api.school.profile()).unsetColour).toBeNull();
    });
    forgetFace(SCHOOL);
    expect((await face("198.51.100.49")).brand).toBe("#0B3D91");
  });

  test("takes a website colour that would not read in its nearest readable shade, never refusing it", async () => {
    const api = await principal();
    const { settings } = await api.site.overview();
    const saveTheme = (theme: typeof settings.theme, expectedVersion: number) =>
      api.site.saveSettings({
        expectedVersion,
        theme,
        chrome: settings.chrome,
        live: settings.live,
        bilingual: settings.bilingual,
        taglineEn: settings.taglineEn,
        taglineAr: settings.taglineAr,
        socialLinks: settings.socialLinks,
        bannerEn: settings.bannerEn,
        bannerAr: settings.bannerAr,
        bannerTone: settings.bannerTone,
        bannerUntil: settings.bannerUntil ?? "",
      });
    const grey = await saveTheme(
      {
        ...settings.theme,
        palette: { ...settings.theme.palette, primary: "#808080" },
      },
      settings.version,
    );
    const shown = (await face("198.51.100.50")).brand;
    expect(shown).toBe(readableBrand("#808080"));
    expect(shown).not.toBe("#808080");
    expect(brandReadable(shown ?? "")).toBe(true);
    expect((await api.school.profile()).unsetColour).toBe(shown);
    await saveTheme(settings.theme, grey.version);
    expect((await face("198.51.100.51")).brand).toBe("#0B3D91");
  });
});
