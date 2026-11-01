import { addDays } from "@faridalms/domain/school";
import { DEFAULT_PERIODS } from "@faridalms/domain/timetable";
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../src/context";
import type { TenantSpec } from "../src/tenants";

import { openOwner } from "../src/context";
import {
  givePeriods,
  periodsInForce,
  replacePeriodsFrom,
} from "../src/stores/periods";
import { createYear, schoolYears, updateYear } from "../src/stores/years";
import { createTenant } from "../src/tenants";
import { CELL, kek, urlFor } from "./harness";

function group(
  tenantId: string,
  schoolIds: [string, string],
): TenantSpec & { tenantId: string } {
  return {
    tenantId,
    kind: "school_group",
    nameEn: "Lakeside Schools",
    defaultLocale: "en",
    jurisdictions: ["EG"],
    schools: schoolIds.map((id, index) => ({
      id,
      nameEn: `Lakeside ${index + 1}`,
      timeZone: "Africa/Cairo",
      countryCode: "EG",
    })),
  };
}

async function inGroup<T>(
  work: (
    tx: CellTransaction,
    ids: { tenantId: string; first: string; second: string },
  ) => Promise<T>,
) {
  const owner = openOwner(urlFor("provisioner"));
  const ids = {
    tenantId: Bun.randomUUIDv7(),
    first: Bun.randomUUIDv7(),
    second: Bun.randomUUIDv7(),
  };
  try {
    return await owner.asOwner(ids.tenantId, "test", async (tx) => {
      await createTenant(tx, group(ids.tenantId, [ids.first, ids.second]), {
        kek,
        cell: CELL,
      });
      return work(tx, ids);
    });
  } finally {
    await owner.close();
  }
}

const year = (
  tenantId: string,
  schoolId: string,
  startsOn: string,
  endsOn: string,
) => ({
  tenantId,
  schoolId,
  titleEn: `Year ${startsOn}`,
  titleAr: null,
  startsOn,
  endsOn,
  terms: [],
});

const target = (id: string, startsOn: string, endsOn: string) => ({
  id,
  startsOn,
  endsBefore: addDays(endsOn, 1),
});

async function weeksOf(tx: CellTransaction, tenantId: string, yearId: string) {
  return tx.execute<{ id: string; number: number; span: string }>(sql`
    select id, number, span::text as span from core.academic_weeks
    where tenant_id = ${tenantId}::uuid and school_year_id = ${yearId}::uuid
      and status = 'active'
    order by lower(span)`);
}

describe("a year's school day", () => {
  test("starts from the platform's default, then from the group's school, then from the school's own year", async () => {
    await inGroup(async (tx, { tenantId, first, second }) => {
      const firstYear = await createYear(
        tx,
        year(tenantId, first, "2030-09-01", "2031-06-30"),
      );
      expect(
        await givePeriods(tx, {
          tenantId,
          schoolId: first,
          target: target(firstYear.id, "2030-09-01", "2031-06-30"),
        }),
      ).toBe("default");
      const given = await periodsInForce(tx, {
        tenantId,
        yearId: firstYear.id,
        on: "2030-09-01",
      });
      expect(given.map((period) => period.nameEn)).toEqual(
        DEFAULT_PERIODS.map((period) => period.nameEn),
      );

      await replacePeriodsFrom(tx, {
        tenantId,
        schoolId: first,
        yearId: firstYear.id,
        yearEndsBefore: "2031-07-01",
        from: "2030-09-01",
        known: given.map((period) => ({
          id: period.id,
          version: period.version,
        })),
        periods: [
          {
            nameEn: "Morning",
            nameAr: null,
            kind: "lesson",
            startTime: "08:30",
            endTime: "10:00",
            official: true,
            weekdays: [7, 1, 2, 3, 4],
          },
        ],
      });

      const sibling = await createYear(
        tx,
        year(tenantId, second, "2030-09-01", "2031-06-30"),
      );
      expect(
        await givePeriods(tx, {
          tenantId,
          schoolId: second,
          target: target(sibling.id, "2030-09-01", "2031-06-30"),
        }),
      ).toBe("group");
      const own = await createYear(
        tx,
        year(tenantId, first, "2031-09-01", "2032-06-30"),
      );
      expect(
        await givePeriods(tx, {
          tenantId,
          schoolId: first,
          target: target(own.id, "2031-09-01", "2032-06-30"),
        }),
      ).toBe("year");
      for (const id of [sibling.id, own.id]) {
        const periods = await periodsInForce(tx, {
          tenantId,
          yearId: id,
          on: id === own.id ? "2031-09-01" : "2030-09-01",
        });
        expect(
          periods.map((period) => [
            period.nameEn,
            period.startTime,
            period.official,
          ]),
        ).toEqual([["Morning", "08:30", true]]);
      }
      expect(
        await givePeriods(tx, {
          tenantId,
          schoolId: first,
          target: target(own.id, "2031-09-01", "2032-06-30"),
        }),
      ).toBe("kept");
    });
  });
});

describe("a year's teaching weeks", () => {
  test("keep their ids and numbers when the year is extended, the last one widening to the week's end", async () => {
    await inGroup(async (tx, { tenantId, first }) => {
      const created = await createYear(
        tx,
        year(tenantId, first, "2059-09-01", "2060-06-30"),
      );
      const before = await weeksOf(tx, tenantId, created.id);
      expect(before[0]).toMatchObject({
        number: 1,
        span: "[2059-09-01,2059-09-07)",
      });
      expect(before.at(-1)?.span.endsWith(",2060-07-01)")).toBe(true);
      const version = (await schoolYears(tx, tenantId, first)).find(
        (row) => row.id === created.id,
      )?.version;
      if (version === undefined) throw new Error("the year is not listed");
      await updateYear(tx, {
        ...year(tenantId, first, "2059-09-01", "2060-07-15"),
        id: created.id,
        expectedVersion: version,
      });
      const after = await weeksOf(tx, tenantId, created.id);
      const lastBefore = before.at(-1);
      if (!lastBefore) throw new Error("the year has no weeks");
      expect(after.slice(0, before.length - 1)).toEqual(before.slice(0, -1));
      expect(after[before.length - 1]).toEqual({
        id: lastBefore.id,
        number: lastBefore.number,
        span: `[${lastBefore.span.slice(1, 11)},2060-07-04)`,
      });
      expect(after.at(-1)).toMatchObject({
        number: before.length + 2,
        span: "[2060-07-11,2060-07-16)",
      });
    });
  });
});
