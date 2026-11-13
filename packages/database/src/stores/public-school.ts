import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { PostalAddress } from "../tables/tenancy";

type Tx = CellTransaction;

export interface PublicSchool {
  nameEn: string;
  nameAr: string | null;
  address: PostalAddress | null;
  phone: string | null;
  email: string | null;
  /** The digits the school writes Arabic in, which its website follows. */
  digits: "latn" | "arab";
  /** The school's clock, which every time on its website is shown on. */
  timeZone: string;
  /** The school's language, the one its website is written in first. */
  defaultLocale: "en" | "ar";
  logoFileId: string | null;
  brandColour: string | null;
}

/** What a school's website may say about the school itself. */
export async function publicSchool(
  tx: Tx,
  orgId: string,
): Promise<PublicSchool | null> {
  const [row] = await tx.execute<{
    name_en: string;
    name_ar: string | null;
    address: PostalAddress | null;
    phone: string | null;
    email: string | null;
    digits: "latn" | "arab";
    time_zone: string | null;
    default_locale: "en" | "ar";
    logo_file_id: string | null;
    brand_colour: string | null;
  }>(sql`
    select name_en, name_ar, address, phone, email, digits, time_zone,
      default_locale, logo_file_id, brand_colour
    from core.orgs
    where id = ${orgId}::uuid and status = 'active'`);
  return row
    ? {
        nameEn: row.name_en,
        nameAr: row.name_ar,
        address: row.address,
        phone: row.phone,
        email: row.email,
        digits: row.digits,
        timeZone: row.time_zone ?? "UTC",
        defaultLocale: row.default_locale,
        logoFileId: row.logo_file_id,
        brandColour: row.brand_colour,
      }
    : null;
}

/** Today in the school's own time zone, for what counts as still to come. */
export async function schoolToday(tx: Tx, orgId: string): Promise<string> {
  const [row] = await tx.execute<{ today: string }>(sql`
    select to_char((statement_timestamp() at time zone coalesce(time_zone, 'UTC'))::date, 'YYYY-MM-DD') as today
    from core.orgs where id = ${orgId}::uuid`);
  return row?.today ?? new Date().toISOString().slice(0, 10);
}
