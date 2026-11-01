import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { MIGRATIONS } from "../src/migrate";
import { harness } from "./harness";

/** The part of the identity migration that moves the website's logo, which a test may run again. */
async function moveLogo() {
  const folder = (await readdir(MIGRATIONS.cell)).find((name) =>
    name.endsWith("_one_school_identity"),
  );
  if (!folder) throw new Error("the identity migration is missing");
  const text = await Bun.file(
    join(MIGRATIONS.cell, folder, "migration.sql"),
  ).text();
  const [, logo] = text.split("--> statement-breakpoint");
  if (!logo) throw new Error("the identity migration moves the logo second");
  return logo;
}

async function rows<T>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await harness().su.unsafe(text, params)) as T[];
}

async function picture(tenantId: string, userId: string, name: string) {
  const id = crypto.randomUUID();
  await harness().su.unsafe(
    `insert into core.files (tenant_id, id, uploaded_by_user_id, purpose, name,
       media_type, size_bytes, storage_key)
     values ($1, $2, $3, 'document_media', $4, 'image/png', 10, $5)`,
    [tenantId, id, userId, name, `t/${tenantId}/f/${id}`],
  );
  return id;
}

describe("one logo for a school", () => {
  test("the website's logo becomes the school's, keeping its public copy, once", async () => {
    const { su, a } = harness();
    const school = a.schools[0]?.id;
    if (!school) throw new Error("tenant A has a school");
    const [user] = await rows<{ id: string }>(
      "select id from core.users where tenant_id = $1 order by id limit 1",
      [a.tenantId],
    );
    if (!user) throw new Error("tenant A has people");
    const printed = await picture(a.tenantId, user.id, "crest.png");
    const shown = await picture(a.tenantId, user.id, "logo.png");
    await su.unsafe(
      "update core.orgs set logo_file_id = $1 where tenant_id = $2 and id = $3",
      [printed, a.tenantId, school],
    );
    const [existing] = await rows<{ id: string }>(
      "select id from core.site_settings where tenant_id = $1 and org_id = $2 and status = 'active'",
      [a.tenantId, school],
    );
    const settings =
      existing?.id ??
      (
        await rows<{ id: string }>(
          "insert into core.site_settings (tenant_id, org_id) values ($1, $2) returning id",
          [a.tenantId, school],
        )
      )[0]?.id;
    await su.unsafe(
      `update core.site_settings
       set chrome = jsonb_set(chrome, '{logoFileId}', to_jsonb($1::text))
       where id = $2`,
      [shown, settings],
    );
    const key = `p/${"b".repeat(26)}/logo.png`;
    await su.unsafe(
      `insert into core.file_publications (tenant_id, file_id, file_purpose,
         public_key, host_type, host_id)
       values ($1, $2, 'document_media', $3, 'site_settings', $4)`,
      [a.tenantId, shown, key, settings],
    );

    const move = await moveLogo();
    await su.unsafe(move);
    await su.unsafe(move);

    const [org] = await rows<{ logo_file_id: string }>(
      "select logo_file_id from core.orgs where tenant_id = $1 and id = $2",
      [a.tenantId, school],
    );
    expect(org?.logo_file_id).toBe(shown);
    const [file] = await rows<{ host_type: string; host_id: string }>(
      "select host_type, host_id from core.files where tenant_id = $1 and id = $2",
      [a.tenantId, shown],
    );
    expect(file).toEqual({ host_type: "org", host_id: school });
    const published = await rows<{ host_type: string; host_id: string }>(
      "select host_type, host_id from core.file_publications where tenant_id = $1 and public_key = $2",
      [a.tenantId, key],
    );
    expect(published).toEqual([{ host_type: "org", host_id: school }]);
    const [chrome] = await rows<{ named: boolean }>(
      "select chrome ? 'logoFileId' as named from core.site_settings where id = $1",
      [settings],
    );
    expect(chrome?.named).toBe(false);
  });

  test("a school whose website named no logo keeps its own", async () => {
    const { su, b } = harness();
    const school = b.schools[0]?.id;
    if (!school) throw new Error("tenant B has a school");
    const [user] = await rows<{ id: string }>(
      "select id from core.users where tenant_id = $1 order by id limit 1",
      [b.tenantId],
    );
    if (!user) throw new Error("tenant B has people");
    const own = await picture(b.tenantId, user.id, "crest.png");
    await su.unsafe(
      "update core.orgs set logo_file_id = $1 where tenant_id = $2 and id = $3",
      [own, b.tenantId, school],
    );
    await su.unsafe(await moveLogo());
    const [org] = await rows<{ logo_file_id: string }>(
      "select logo_file_id from core.orgs where tenant_id = $1 and id = $2",
      [b.tenantId, school],
    );
    expect(org?.logo_file_id).toBe(own);
  });
});
