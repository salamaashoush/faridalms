import { SlugTakenError } from "@faridalms/database/directory/admin";
import { describe, expect, test } from "bun:test";

import { directory, inDirectory, tenantWith } from "./harness";

const OWNER = "op-owner";
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);
const move = (schoolId: string, slug: string) =>
  directory().moveSchool({
    schoolId,
    slug,
    until: inDays(90),
    operatorId: OWNER,
    reason: "The school's new name",
  });

describe("a school's portal address", () => {
  test("moves, keeps the old one for itself until its day, and can move back", async () => {
    const { schoolIds } = await tenantWith(["birchwood"]);
    const [birch] = schoolIds;
    if (!birch) throw new Error("school");
    const { schoolIds: others } = await tenantWith(["elmhurst"]);
    const [elm] = others;
    if (!elm) throw new Error("school");

    expect(await move(birch, "birchwood-academy")).toBe(true);
    expect((await directory().school(birch))?.slug).toBe("birchwood-academy");
    expect(
      (await directory().formerAddresses(birch)).map((row) => row.slug),
    ).toEqual(["birchwood"]);

    // Nobody else takes the address it left, nor the one it holds.
    expect(
      await move(elm, "birchwood").catch((error: unknown) => error),
    ).toBeInstanceOf(SlugTakenError);
    expect(
      await move(elm, "birchwood-academy").catch((error: unknown) => error),
    ).toBeInstanceOf(SlugTakenError);

    // Moving back takes up the old address and leaves the other behind.
    expect(await move(birch, "birchwood")).toBe(true);
    expect(
      (await directory().formerAddresses(birch)).map((row) => row.slug),
    ).toEqual(["birchwood-academy"]);

    // Once its day has passed, another school may take it.
    await inDirectory(
      (sql) =>
        sql`update former_slugs set until = now() - interval '1 day' where slug = 'birchwood-academy'`,
    );
    expect(await move(elm, "birchwood-academy")).toBe(true);
  });

  test("renaming a standalone school renames its tenant", async () => {
    const { tenantId, schoolIds } = await tenantWith(["hazelmere"]);
    const [hazel] = schoolIds;
    if (!hazel) throw new Error("school");
    expect(
      await directory().renameSchool({
        schoolId: hazel,
        nameEn: "Hazelmere Academy",
        nameAr: "أكاديمية هازلمير",
        operatorId: OWNER,
        reason: "Registered under a new name",
      }),
    ).toBe(true);
    const school = await directory().school(hazel);
    expect(school).toMatchObject({
      nameEn: "Hazelmere Academy",
      nameAr: "أكاديمية هازلمير",
      tenantNameEn: "Hazelmere Academy",
    });
    expect(school?.tenantId).toBe(tenantId);
  });
});
