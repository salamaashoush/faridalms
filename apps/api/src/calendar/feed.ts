import { reachOf } from "@faridalms/database/stores/audiences";
import {
  eventsBetween,
  openFeed,
  specialDays,
} from "@faridalms/database/stores/events";
import { schoolProfile } from "@faridalms/database/stores/identity";
import { calendarIcs } from "@faridalms/domain/calendar";
import { addDays } from "@faridalms/domain/school";

import type { RequestContext } from "../core/context";

import { portalOrigin } from "../core/portal";
import { dateIn } from "../core/procedure";
import { feedLessons } from "./lessons";

const FEED = /^\/feeds\/([a-z0-9-]{1,60})\/([A-Za-z0-9_-]{43})\.ics$/;

/** How far back and ahead a feed reaches, as school calendar feeds commonly do. */
const BACK_DAYS = 30;
const AHEAD_DAYS = 365;

const LABEL = {
  en: { cancelled: "Cancelled", calendar: "calendar" },
  ar: { cancelled: "ملغاة", calendar: "تقويم" },
} as const;

export const hashFeedToken = (token: string) =>
  new Bun.CryptoHasher("sha256").update(token).digest("hex");

/** A new calendar link secret: 32 random bytes, URL-safe. */
export function newFeedToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

/**
 * A person's calendar as an iCalendar file, for the calendar apps that poll
 * a private link without any session: events, closures and their lessons. The school is named in the address and
 * the secret stands for the person; what they see is worked out now, from
 * their reach today, so a link outlives nothing it should not.
 */
export async function handleCalendarFeed(
  request: Request,
  url: URL,
  context: RequestContext,
): Promise<Response | null> {
  const match = FEED.exec(url.pathname);
  if (!match) return null;
  const [, slug = "", token = ""] = match;
  if (request.method !== "GET")
    return Response.json({ code: "METHOD_NOT_ALLOWED" }, { status: 405 });
  const school = await context.directory.bySlug(slug);
  if (!school) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  const body = await context.cell.withTenant(
    {
      tenantId: school.tenantId,
      requestId: context.requestId,
      actor: { kind: "system" },
    },
    "write",
    async (tx) => {
      const owner = await openFeed(tx, {
        tenantId: school.tenantId,
        orgId: school.schoolId,
        tokenHash: hashFeedToken(token),
      });
      if (!owner) return null;
      const profile = await schoolProfile(tx, school.schoolId);
      const timeZone = profile?.timeZone ?? "UTC";
      const today = dateIn(timeZone);
      const range = {
        tenantId: school.tenantId,
        schoolId: school.schoolId,
        from: addDays(today, -BACK_DAYS),
        to: addDays(today, AHEAD_DAYS),
      };
      const reach = await reachOf(tx, {
        tenantId: school.tenantId,
        schoolId: school.schoolId,
        userId: owner.userId,
        on: today,
      });
      const origin = portalOrigin(school, context.domains);
      const [events, days, lessons] = await Promise.all([
        eventsBetween(tx, {
          ...range,
          viewerId: owner.userId,
          reach,
          drafts: false,
        }),
        specialDays(tx, range),
        feedLessons(tx, {
          tenantId: school.tenantId,
          schoolId: school.schoolId,
          userId: owner.userId,
          today,
          locale: owner.locale,
          origin,
        }),
      ]);
      const ar = owner.locale === "ar";
      const pick = (en: string | null, other: string | null) =>
        (ar ? (other ?? en) : (en ?? other)) ?? "";
      const words = LABEL[owner.locale];
      const name = pick(profile?.nameEn ?? null, profile?.nameAr ?? null);
      return calendarIcs({
        name: ar ? `${words.calendar} ${name}` : `${name} ${words.calendar}`,
        timeZone,
        stamp: new Date(),
        cancelledLabel: words.cancelled,
        urlOf: (id) => `${origin}/calendar/${id}`,
        events: [
          ...events.map((event) => ({
            ...event,
            title: pick(event.titleEn, event.titleAr),
            description: "",
          })),
          ...lessons,
        ],
        days: days.map((day) => {
          const kind = pick(day.labelEn, day.labelAr);
          const note = pick(day.noteEn, day.noteAr);
          return { day: day.day, title: note ? `${kind}: ${note}` : kind };
        }),
      });
    },
  );
  if (body === null)
    return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  return new Response(body, {
    headers: { "content-type": "text/calendar; charset=utf-8" },
  });
}
