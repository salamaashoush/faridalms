import type { PublicClassRow } from "@faridalms/database/stores/site-classes";
import type { SiteClass } from "@faridalms/domain/site-classes";
import type { SiteLocale } from "@faridalms/domain/site-sections";

import { classById } from "@faridalms/database/stores/classes";
import { schoolToday } from "@faridalms/database/stores/public-school";
import { siteSettings } from "@faridalms/database/stores/site";
import {
  publicSiteClasses,
  saveSiteClass,
  siteClassChoices,
  siteClassOf,
  siteCourses,
} from "@faridalms/database/stores/site-classes";
import {
  classWebsiteIssues,
  classWebsiteSchema,
  publicClassesSchema,
} from "@faridalms/domain/site-classes";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import {
  audit,
  publicProcedure,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { publishMedia, withdrawMedia, withWebsite } from "../core/site";

const byClass = v.object({ classId: v.pipe(v.string(), v.uuid()) });

const classHost = (context: UnitContext, classId: string) => ({
  tenantId: context.tenantId,
  hostType: "site_class",
  hostId: classId,
});

/**
 * A class of the school, for whoever keeps its classes or its website:
 * either may say how the class reads on the site, and nothing more of it.
 */
async function classOfSchool(context: UnitContext, classId: string) {
  requireCapability(context, "classes:manage", "site:manage");
  const found = await classById(context.tx, context, classId);
  if (!found) throw new ORPCError("NOT_FOUND");
  return found;
}

const BLANK = {
  version: 0,
  shown: false,
  titleEn: "",
  titleAr: "",
  descriptionEn: "",
  descriptionAr: "",
  levelEn: "",
  levelAr: "",
  pictureFileId: null,
  pictureAltEn: "",
  pictureAltAr: "",
};

/** How a class reads on the website, for its record. */
export const classWebsite = readProcedure
  .input(byClass)
  .handler(async ({ input, context }) => {
    const found = await classOfSchool(context, input.classId);
    const [row, settings] = await Promise.all([
      siteClassOf(context.tx, {
        tenantId: context.tenantId,
        classId: found.id,
      }),
      siteSettings(context.tx, context.tenantId, context.schoolId),
    ]);
    return {
      classTitleEn: found.titleEn,
      classTitleAr: found.titleAr,
      live: settings?.live ?? false,
      ...(row
        ? {
            version: row.version,
            shown: row.shown,
            titleEn: row.titleEn,
            titleAr: row.titleAr,
            descriptionEn: row.descriptionEn,
            descriptionAr: row.descriptionAr,
            levelEn: row.levelEn,
            levelAr: row.levelAr,
            pictureFileId: row.pictureFileId,
            pictureAltEn: row.pictureAltEn,
            pictureAltAr: row.pictureAltAr,
          }
        : BLANK),
    };
  });

/** Shows a class on the website, or takes it off, with the words a visitor reads. */
export const saveClassWebsite = writeProcedure
  .input(classWebsiteSchema)
  .handler(async ({ input, context }) => {
    const found = await classOfSchool(context, input.classId);
    const [issue] = classWebsiteIssues(input);
    if (issue)
      throw new ORPCError("BAD_REQUEST", {
        message:
          issue === "description" ? "site.class_description" : "site.class_alt",
      });
    const host = classHost(context, found.id);
    const fileId = input.shown ? input.pictureFileId : null;
    let pictureKey: string | null = null;
    let picture = null;
    if (fileId) {
      const published = await publishMedia(context, host, [fileId]);
      pictureKey = published.media[fileId] ?? null;
      picture = published.pictures[fileId] ?? null;
    }
    await withdrawMedia(context, host, fileId ? [fileId] : []);
    const saved = await saveSiteClass(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      classId: found.id,
      expectedVersion: input.expectedVersion,
      shown: input.shown,
      titleEn: input.titleEn,
      titleAr: input.titleAr,
      descriptionEn: input.descriptionEn,
      descriptionAr: input.descriptionAr,
      levelEn: input.levelEn,
      levelAr: input.levelAr,
      pictureFileId: input.pictureFileId,
      pictureAltEn: input.pictureAltEn,
      pictureAltAr: input.pictureAltAr,
      pictureKey,
      picture,
    });
    if (!saved)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await audit(context, {
      action: "site.class_save",
      objectType: "class",
      objectId: found.id,
      details: { shown: input.shown },
    });
    return saved;
  });

const pick = (
  en: string,
  ar: string,
  locale: SiteLocale,
  primary: SiteLocale,
) => (locale === "ar" ? ar : en) || (primary === "ar" ? ar : en) || en || ar;

/** A shown class in one language, the site's first standing in for words not written. */
export function siteClassIn(
  row: PublicClassRow,
  locale: SiteLocale,
  primary: SiteLocale,
): SiteClass {
  return {
    id: row.classId,
    title: pick(row.titleEn ?? "", row.titleAr ?? "", locale, primary),
    description: pick(row.descriptionEn, row.descriptionAr, locale, primary),
    level: pick(row.levelEn, row.levelAr, locale, primary),
    picture: row.pictureKey
      ? {
          key: row.pictureKey,
          alt: pick(row.pictureAltEn, row.pictureAltAr, locale, primary),
          published: row.picture,
        }
      : null,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    courseId: row.courseId,
    teachers: locale === "ar" ? row.teachersAr : row.teachersEn,
  };
}

/**
 * What the builder's courses section is drawn and chosen from: the classes
 * the school shows, in each language, and every class and course it may
 * pick from.
 */
export const siteClasses = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "site:manage");
  const scope = { tenantId: context.tenantId, orgId: context.schoolId };
  const [settings, rows, choices, courses] = await Promise.all([
    siteSettings(context.tx, context.tenantId, context.schoolId),
    publicSiteClasses(context.tx, {
      orgId: context.schoolId,
      today: context.today,
    }),
    siteClassChoices(context.tx, { ...scope, today: context.today }),
    siteCourses(context.tx, scope),
  ]);
  const primary = settings?.primaryLocale ?? "en";
  return {
    today: context.today,
    shown: {
      en: rows.map((row) => siteClassIn(row, "en", primary)),
      ar: rows.map((row) => siteClassIn(row, "ar", primary)),
    },
    choices,
    courses,
  };
});

/**
 * The classes a school shows on its live website, for a visitor: the words
 * written for the site, the days each runs and its teachers' names, of
 * classes not yet ended. Nothing else of a class is read.
 */
export const publicSiteClassList = publicProcedure
  .input(publicClassesSchema)
  .handler(({ input, context }) =>
    withWebsite(context, input.school, async ({ tx, tenantId, schoolId }) => {
      const settings = await siteSettings(tx, tenantId, schoolId);
      if (!settings?.live) throw new ORPCError("NOT_FOUND");
      const primary = settings.primaryLocale;
      const locale =
        input.locale && (settings.bilingual || input.locale === primary)
          ? input.locale
          : primary;
      const today = await schoolToday(tx, schoolId);
      const rows = await publicSiteClasses(tx, { orgId: schoolId, today });
      return {
        today,
        classes: rows.map((row) => siteClassIn(row, locale, primary)),
      };
    }),
  );
