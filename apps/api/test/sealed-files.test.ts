import { withPurpose } from "@faridalms/database/context";
import { newDataKey } from "@faridalms/database/crypto";
import {
  fileById,
  quarantineKey,
  sealedKey,
  studentOfFile,
} from "@faridalms/database/stores/files";
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import { createKeyRing } from "../src/core/keys";
import { SCHOOL_HEADER } from "../src/core/procedure";
import { createFilesHost, linkKey } from "../src/files/links";
import { fileKeys, openSealedObject, sealedSize } from "../src/files/sealed";
import {
  FILES_ORIGIN,
  handlerWith,
  raw,
  rejection,
  seeded,
  sessionFor,
} from "./harness";

type Session = Awaited<ReturnType<typeof sessionFor>>;

function loginAt(slug: string, role: string, index = 0) {
  const tenant = seeded().tenants.find((row) =>
    row.schools.some((school) => school.slug === slug),
  );
  const school = tenant?.schools.find((row) => row.slug === slug);
  const name = tenant?.logins
    .filter((row) => row.role === role && row.schoolId === school?.id)
    .at(index)?.loginName;
  if (!name) throw new Error(`the seed has no ${role} ${index} at ${slug}`);
  return name;
}

const tenantOf = (slug: string) => {
  const tenant = seeded().tenants.find((row) =>
    row.schools.some((school) => school.slug === slug),
  );
  if (!tenant) throw new Error(`no tenant holds ${slug}`);
  return tenant.tenantId;
};

/** A letter as a PDF that spans several sealed segments. */
function letter(words: string) {
  const line = `${words}\n`;
  return new TextEncoder().encode(
    `%PDF-1.4\n${line.repeat(Math.ceil(150_000 / line.length))}`,
  );
}

async function upload(
  session: Session,
  input: {
    purpose: "health_report" | "evidence";
    name: string;
    body: Uint8Array<ArrayBuffer>;
  },
  slug = "northwind",
) {
  const file = await session.api.files.initiate({
    purpose: input.purpose,
    name: input.name,
    mediaType: "application/pdf",
    sizeBytes: input.body.byteLength,
  });
  const put = await raw(slug, session.token, `/v1/files/${file.id}/content`, {
    method: "PUT",
    body: input.body,
  });
  expect(put.status).toBe(200);
  return file;
}

/** What the files row says about where and how its bytes rest, read behind the health purpose. */
async function stored(tenantId: string, fileId: string) {
  const [row] = await seeded().cell.withWorker(
    { tenantId, requestId: crypto.randomUUID(), actor: { kind: "system" } },
    "read",
    (tx) =>
      withPurpose(tx, "health", (inner) =>
        inner.execute<{
          name: string;
          storage_key: string;
          encryption: string;
          key_version: number | null;
          stream_state: string | null;
        }>(sql`
          select name, storage_key, encryption, key_version, stream_state from core.files
          where tenant_id = ${tenantId}::uuid and id = ${fileId}::uuid`),
      ),
  );
  if (!row) throw new Error("the report has a row");
  return row;
}

async function bytesAt(key: string) {
  const body = await seeded().files.open(key);
  if (!body) return null;
  return new Uint8Array(await new Response(body).arrayBuffer());
}

/** A student of the school and a health record of theirs, as the health staff make one. */
async function recordFor(office: Session) {
  const mother = await sessionFor(
    "northwind",
    loginAt("northwind", "parent", 17),
  );
  const me = await mother.api.identity.currentUser();
  const child = (await mother.api.people.person({ id: me.id })).children[0];
  if (!child) throw new Error("the seeded mother follows a child");
  const { kinds } = await office.api.records.health({
    studentId: child.studentId,
  });
  const kind = kinds.find((row) => row.code === "chronic_condition");
  if (!kind) throw new Error("the seed has the condition health kind");
  const { id } = await office.api.records.saveHealth({
    studentId: child.studentId,
    kindId: kind.id,
    hasAlert: false,
    text: "Asthma",
  });
  const held = (
    await office.api.records.health({ studentId: child.studentId })
  ).records.find((row) => row.id === id);
  if (!held) throw new Error("the record was kept");
  return { studentId: child.studentId, record: held };
}

describe("medical reports at rest", () => {
  test("are sealed under the school's key after their checks, and open whole or in part for the health staff alone", async () => {
    const office = await sessionFor(
      "northwind",
      loginAt("northwind", "principal"),
    );
    const tenantId = tenantOf("northwind");
    const { studentId, record } = await recordFor(office);
    const body = letter(
      "Dr Hassan confirms asthma; the inhaler stays in class.",
    );
    const file = await upload(office, {
      purpose: "health_report",
      name: "Dr Hassan letter.pdf",
      body,
    });
    expect(file.name).toBe("Dr Hassan letter.pdf");

    const row = await stored(tenantId, file.id);
    expect(row).toMatchObject({
      name: "medical-report.pdf",
      encryption: "tenant_dek",
      key_version: expect.any(Number),
      stream_state: null,
      storage_key: sealedKey(tenantId, file.id),
    });
    const atRest = await bytesAt(row.storage_key);
    expect(atRest?.byteLength).toBe(sealedSize(body.byteLength));
    expect(Buffer.from(atRest ?? []).includes("inhaler")).toBe(false);
    expect(Buffer.from(atRest ?? []).includes("%PDF")).toBe(false);
    expect(await bytesAt(quarantineKey(tenantId, file.id))).toBeNull();

    await office.api.records.attachHealthReport({
      studentId,
      recordId: record.id,
      expectedVersion: record.version,
      report: { fileId: file.id, name: file.name },
      shared: false,
    });
    const shown = (await office.api.records.health({ studentId })).records.find(
      (entry) => entry.id === record.id,
    );
    expect(shown?.report).toEqual({
      fileId: file.id,
      mediaType: "application/pdf",
      sizeBytes: file.sizeBytes,
      name: "Dr Hassan letter.pdf",
      shared: false,
    });
    // Opening it is recorded about the student, so it reaches their
    // history; the record naming them is read only within its purpose.
    const unit = {
      tenantId,
      requestId: crypto.randomUUID(),
      actor: { kind: "system" as const },
    };
    expect(
      await seeded().cell.withWorker(unit, "read", (tx) =>
        withPurpose(tx, "health", async (inner) => {
          const held = await fileById(inner, tenantId, file.id);
          return held ? studentOfFile(inner, tenantId, held) : null;
        }),
      ),
    ).toBe(studentId);

    const path = `/v1/files/${file.id}/content`;
    const whole = await raw("northwind", office.token, path);
    expect(whole.status).toBe(200);
    expect(whole.headers.get("cache-control")).toBe("private, no-store");
    expect(whole.headers.get("content-disposition")).toContain(
      "medical-report.pdf",
    );
    expect(new Uint8Array(await whole.arrayBuffer())).toEqual(body);
    const from = 65_530;
    const piece = await raw("northwind", office.token, path, {
      headers: { range: `bytes=${from}-${from + 99}` },
    });
    expect(piece.status).toBe(206);
    expect(new Uint8Array(await piece.arrayBuffer())).toEqual(
      body.slice(from, from + 100),
    );

    const teacher = await sessionFor(
      "northwind",
      loginAt("northwind", "teacher"),
    );
    expect((await raw("northwind", teacher.token, path)).status).toBe(404);
  });

  test("are invisible and unwritable without the health purpose, so a step that forgets it refuses", async () => {
    const office = await sessionFor(
      "northwind",
      loginAt("northwind", "principal"),
    );
    const tenantId = tenantOf("northwind");
    const file = await upload(office, {
      purpose: "health_report",
      name: "allergy-plan.pdf",
      body: letter("Sesame: severe."),
    });
    const unit = {
      tenantId,
      requestId: crypto.randomUUID(),
      actor: { kind: "system" as const },
    };
    const { cell } = seeded();
    expect(
      await cell.withWorker(unit, "read", (tx) =>
        fileById(tx, tenantId, file.id),
      ),
    ).toBeNull();
    const renamed = await cell.withWorker(unit, "write", (tx) =>
      tx.execute(sql`
        update core.files set name = 'medical-report.txt'
        where tenant_id = ${tenantId}::uuid and id = ${file.id}::uuid returning id`),
    );
    expect(renamed.length).toBe(0);
    expect(
      await rejection(
        cell.withWorker(unit, "write", (tx) =>
          tx.execute(sql`
            insert into core.files (tenant_id, purpose, name, media_type, size_bytes, storage_key)
            values (${tenantId}::uuid, 'health_report', 'medical-report.pdf', 'application/pdf', 10,
              ${`t/${tenantId}/q/${crypto.randomUUID()}`})`),
        ),
      ),
    ).toBeDefined();
    expect((await office.api.files.facts({ ids: [file.id] })).files).toEqual(
      [],
    );
    expect(
      await cell.withWorker(unit, "read", (tx) =>
        withPurpose(tx, "health", (inner) =>
          fileById(inner, tenantId, file.id),
        ),
      ),
    ).toMatchObject({ id: file.id, purpose: "health_report" });
  });

  test("never open in another school, nor anywhere the object is copied to", async () => {
    const office = await sessionFor(
      "northwind",
      loginAt("northwind", "principal"),
    );
    const tenantId = tenantOf("northwind");
    const body = letter("Only for Northwind's nurse.");
    const file = await upload(office, {
      purpose: "health_report",
      name: "nurse.pdf",
      body,
    });
    const elsewhere = await sessionFor("acme", loginAt("acme", "principal"));
    expect(
      (await raw("acme", elsewhere.token, `/v1/files/${file.id}/content`))
        .status,
    ).toBe(404);

    const row = await stored(tenantId, file.id);
    const { files, cell, dependencies } = seeded();
    const other = tenantOf("acme");
    const copied = sealedKey(other, file.id);
    const atRest = await files.open(row.storage_key);
    if (!atRest) throw new Error("the sealed object is there");
    await files.write(copied, atRest, sealedSize(body.byteLength));
    const keys = fileKeys({ cell, keys: dependencies.keys });
    const read = async (object: { tenantId: string; storageKey: string }) => {
      const plain = await openSealedObject(files, keys, {
        ...object,
        keyVersion: row.key_version ?? 0,
        sizeBytes: body.byteLength,
      });
      return plain ? new Response(plain).arrayBuffer() : null;
    };
    expect(
      new Uint8Array(
        (await read({ tenantId, storageKey: row.storage_key })) ??
          new ArrayBuffer(0),
      ),
    ).toEqual(body);
    expect(
      await rejection(read({ tenantId: other, storageKey: copied })),
    ).toBeDefined();
    expect(
      await rejection(read({ tenantId, storageKey: copied })),
    ).toBeDefined();
    await files.remove(copied);
  });

  test("still open after the school's files key is rotated, and new ones are sealed under the new key", async () => {
    const tenantId = tenantOf("acme");
    const office = await sessionFor("acme", loginAt("acme", "principal"));
    const before = letter("Sealed before the rotation.");
    const old = await upload(
      office,
      { purpose: "health_report", name: "before.pdf", body: before },
      "acme",
    );
    const { cell, kek, files, cellSecret } = seeded();
    const operator = {
      tenantId,
      requestId: crypto.randomUUID(),
      actor: { kind: "operator" as const },
    };
    const next = await cell.withWorker(operator, "write", async (tx) => {
      const [current] = await tx.execute<{ version: number }>(sql`
        select max(key_version)::int as version from core.tenant_keys
        where tenant_id = ${tenantId}::uuid and purpose = 'files'`);
      const version = (current?.version ?? 0) + 1;
      const wrapped = await kek.wrap(newDataKey(), {
        cell: "eg-1",
        tenantId,
        purpose: "files",
        keyVersion: version,
      });
      await tx.execute(sql`
        update core.tenant_keys set retired_at = statement_timestamp()
        where tenant_id = ${tenantId}::uuid and purpose = 'files' and retired_at is null`);
      await tx.execute(sql`
        insert into core.tenant_keys (tenant_id, purpose, key_version, kms_key_ref, wrapped_dek)
        values (${tenantId}::uuid, 'files', ${version}, ${kek.ref}, ${Buffer.from(wrapped)})`);
      return version;
    });
    expect((await stored(tenantId, old.id)).key_version).toBe(next - 1);

    // A process started after the rotation, whose key ring has not cached the old key as active.
    const keys = createKeyRing(kek, "eg-1");
    const handler = handlerWith({ keys });
    const host = createFilesHost({
      files,
      key: linkKey(cellSecret),
      keys: fileKeys({ cell, keys }),
    });
    const request = async (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set("authorization", `Bearer ${office.token}`);
      headers.set(SCHOOL_HEADER, "acme");
      const response = await handler(
        new Request(`http://api.test${path}`, { ...init, headers }),
      );
      const location = response.headers.get("location");
      return location?.startsWith(`${FILES_ORIGIN}/`)
        ? host(new Request(location))
        : response;
    };
    const after = letter("Sealed after the rotation.");
    const initiated = await office.api.files.initiate({
      purpose: "health_report",
      name: "after.pdf",
      mediaType: "application/pdf",
      sizeBytes: after.byteLength,
    });
    expect(
      (
        await request(`/v1/files/${initiated.id}/content`, {
          method: "PUT",
          body: after,
        })
      ).status,
    ).toBe(200);
    expect((await stored(tenantId, initiated.id)).key_version).toBe(next);
    for (const [id, body] of [
      [old.id, before],
      [initiated.id, after],
    ] as const) {
      const read = await request(`/v1/files/${id}/content`);
      expect(read.status).toBe(200);
      expect(new Uint8Array(await read.arrayBuffer())).toEqual(body);
    }
  });
});
