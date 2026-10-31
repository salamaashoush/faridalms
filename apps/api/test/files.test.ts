import type { ContentDocument } from "@faridalms/domain/content";

import { openDirectorySync } from "@faridalms/database/directory/client";
import { plainContent } from "@faridalms/domain/content-conversion";
import { SQL } from "bun";
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import { sweepTenantFiles } from "../src/files/sweep";
import { reportTenantUsage } from "../src/files/upkeep";
import {
  login,
  raw,
  rejection,
  seeded,
  sessionFor,
  setPlan,
  signedIn,
  testDirectory,
} from "./harness";

const text = (value: string) => new Blob([value]);

async function upload(
  token: string,
  api: Awaited<ReturnType<typeof sessionFor>>["api"],
  name: string,
  body: Blob,
  declared = body.size,
) {
  const file = await api.files.initiate({
    purpose: "attachment",
    name,
    mediaType: name.endsWith(".pdf") ? "application/pdf" : "text/plain",
    sizeBytes: declared,
  });
  const response = await raw(
    "northwind",
    token,
    `/v1/files/${file.id}/content`,
    {
      method: "PUT",
      body,
    },
  );
  return { file, response };
}

describe("files", () => {
  test("an upload is verified, served to its uploader and to nobody else before it has a host", async () => {
    const teacher = await sessionFor("northwind", login("teacher"));
    const body = text("Chapter 3 questions");
    const { file, response } = await upload(
      teacher.token,
      teacher.api,
      "questions.txt",
      body,
    );
    expect(response.status).toBe(200);
    const read = await raw(
      "northwind",
      teacher.token,
      `/v1/files/${file.id}/content`,
    );
    expect(read.status).toBe(200);
    expect(await read.text()).toBe("Chapter 3 questions");
    expect(read.headers.get("content-disposition")).toContain("questions.txt");

    const parent = await sessionFor("northwind", login("parent"));
    const refused = await raw(
      "northwind",
      parent.token,
      `/v1/files/${file.id}/content`,
    );
    expect(refused.status).toBe(404);
    const again = await raw(
      "northwind",
      teacher.token,
      `/v1/files/${file.id}/content`,
      {
        method: "PUT",
        body,
      },
    );
    expect(again.status).toBe(404);
  });

  test("bytes that do not match their name or size are refused and never served", async () => {
    const teacher = await sessionFor("northwind", login("teacher"));
    const fake = await upload(
      teacher.token,
      teacher.api,
      "report.pdf",
      text("not really a pdf"),
    );
    expect(fake.response.status).toBe(422);
    expect(await fake.response.json()).toMatchObject({
      code: "file.content_mismatch",
    });
    expect(
      (
        await raw(
          "northwind",
          teacher.token,
          `/v1/files/${fake.file.id}/content`,
        )
      ).status,
    ).toBe(404);
    const short = await upload(
      teacher.token,
      teacher.api,
      "notes.txt",
      text("short"),
      50,
    );
    expect(short.response.status).toBe(400);
  });

  test("a family cannot upload a teacher's attachment", async () => {
    const parent = await sessionFor("northwind", login("parent"));
    expect(
      await rejection(
        parent.api.files.initiate({
          purpose: "document_media",
          name: "photo.png",
          mediaType: "image/png",
          sizeBytes: 10,
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
  });

  test("a drawing's scene uploads as document media, and other JSON does not", async () => {
    const teacher = await sessionFor("northwind", login("teacher"));
    const send = async (body: string) => {
      const file = await teacher.api.files.initiate({
        purpose: "document_media",
        name: "drawing.excalidraw",
        mediaType: "application/json",
        sizeBytes: new Blob([body]).size,
      });
      return raw("northwind", teacher.token, `/v1/files/${file.id}/content`, {
        method: "PUT",
        body,
      });
    };
    expect(
      (await send('{"type":"excalidraw","version":2,"elements":[]}')).status,
    ).toBe(200);
    expect((await send('{"type":"report"}')).status).toBe(422);
  });

  test("whoever writes notices or events may embed media in them", async () => {
    const principal = await signedIn("northwind", login("principal"));
    const office = await sessionFor("northwind", login("staff"));
    const photo = {
      purpose: "document_media" as const,
      name: "photo.png",
      mediaType: "image/png",
      sizeBytes: 10,
    };
    expect(await rejection(office.api.files.initiate(photo))).toMatchObject({
      code: "FORBIDDEN",
    });
    const { id: userId } = await office.api.identity.currentUser();
    const role = await principal.access.saveRole({
      nameEn: "Notices",
      capabilities: ["announcements:manage"],
    });
    await principal.access.assign({
      userId,
      accessRoleId: role.id,
      reason: "Writes the weekly notices.",
    });
    const writer = await sessionFor("northwind", login("staff"));
    const started = await writer.api.files.initiate(photo);
    expect(started.mediaType).toBe("image/png");
    const held = await principal.access.personAccess({ userId });
    const assignment = held.assignments.find(
      (row) => row.accessRoleId === role.id,
    );
    if (!assignment) throw new Error("assignment missing");
    await principal.access.endAssignmentOf({
      assignmentId: assignment.id,
      expectedVersion: assignment.version,
    });
  });

  test("the sweep rejects abandoned uploads and retires files nothing linked", async () => {
    const teacher = await sessionFor("northwind", login("teacher"));
    const pending = await teacher.api.files.initiate({
      purpose: "attachment",
      name: "never-sent.txt",
      mediaType: "text/plain",
      sizeBytes: 5,
    });
    const kept = await upload(
      teacher.token,
      teacher.api,
      "unlinked.txt",
      text("unlinked"),
    );
    expect(kept.response.status).toBe(200);
    const { cell, files, tenants } = seeded();
    const tenantId = tenants[0]?.tenantId;
    if (!tenantId) throw new Error("seed tenant");
    const later = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    const result = await sweepTenantFiles(cell, files, tenantId, later);
    expect(result.abandoned).toBeGreaterThanOrEqual(1);
    expect(result.retired).toBeGreaterThanOrEqual(1);
    const retry = await raw(
      "northwind",
      teacher.token,
      `/v1/files/${pending.id}/content`,
      { method: "PUT", body: text("12345") },
    );
    expect(retry.status).toBe(404);
    expect(
      (
        await raw(
          "northwind",
          teacher.token,
          `/v1/files/${kept.file.id}/content`,
        )
      ).status,
    ).toBe(404);
  });
});

/** A brief of a sentence and a file block, as the editor stores one. */
function withFile(fileId: string, words: string): ContentDocument {
  const document = plainContent(words);
  document.root.children?.push({
    type: "file",
    version: 1,
    format: "",
    fileId,
    name: "worksheet.txt",
    mime: "text/plain",
    bytes: 9,
  });
  return document;
}

describe("reading a file", () => {
  test("a viewer gets it inline and in pieces, and asking to download saves it", async () => {
    const teacher = await sessionFor("northwind", login("teacher"));
    const { file } = await upload(
      teacher.token,
      teacher.api,
      "notes.txt",
      text("0123456789"),
    );
    const path = `/v1/files/${file.id}/content`;
    const whole = await raw("northwind", teacher.token, path);
    expect(whole.headers.get("content-disposition")).toStartWith("inline;");
    expect(whole.headers.get("accept-ranges")).toBe("bytes");

    const piece = await raw("northwind", teacher.token, path, {
      headers: { range: "bytes=2-5" },
    });
    expect(piece.status).toBe(206);
    expect(piece.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(await piece.text()).toBe("2345");
    expect(
      (
        await raw("northwind", teacher.token, path, {
          headers: { range: "bytes=10-" },
        })
      ).status,
    ).toBe(416);

    const saved = await raw("northwind", teacher.token, `${path}?download`);
    expect(saved.headers.get("content-disposition")).toStartWith("attachment;");
  });
});

describe("files in documents", () => {
  test("a document's file opens for its readers only, and nobody may borrow it", async () => {
    // The seed's second teacher teaches Arabic to every grade, the third English.
    const teacher = await sessionFor("northwind", login("teacher", 0, 1));
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const file = await teacher.api.files.initiate({
      purpose: "document_media",
      name: "worksheet.txt",
      mediaType: "text/plain",
      sizeBytes: 9,
    });
    const put = await raw(
      "northwind",
      teacher.token,
      `/v1/files/${file.id}/content`,
      {
        method: "PUT",
        body: text("worksheet"),
      },
    );
    expect(put.status).toBe(200);

    const { classes } = await teacher.api.coursework.options();
    let classId = "";
    for (const row of classes.filter(
      (item) => item.classType === "scheduled",
    )) {
      const { roster } = await teacher.api.coursework.groups({
        classId: row.id,
      });
      if (roster.some((pupil) => pupil.id === me.id)) classId = row.id;
    }
    const saved = await teacher.api.coursework.save({
      classId,
      title: "Worksheet in the brief",
      brief: withFile(file.id, "Fill in the worksheet."),
      audience: "class",
      latePolicy: "accept",
      submissionFormat: "both",
      points: 10,
      rubric: null,
    });
    const read = () =>
      raw("northwind", student.token, `/v1/files/${file.id}/content`);
    expect((await read()).status).toBe(404);
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    expect((await read()).status).toBe(200);

    const english = await sessionFor("northwind", login("teacher", 0, 2));
    expect(
      (await raw("northwind", english.token, `/v1/files/${file.id}/content`))
        .status,
    ).toBe(404);
    const theirs = await english.api.coursework.options();
    const other = theirs.classes.find((row) => row.classType === "scheduled");
    if (!other) throw new Error("the English teacher has no class");
    expect(
      await rejection(
        english.api.coursework.save({
          classId: other.id,
          title: "Borrowed worksheet",
          brief: withFile(file.id, "Someone else's file."),
          audience: "class",
          latePolicy: "accept",
          submissionFormat: "both",
          points: 10,
          rubric: null,
        }),
      ),
    ).toMatchObject({ message: "file.not_attachable" });
  });

  test("a file put in another class's document is copied there, and the first class keeps its own", async () => {
    const teacher = await sessionFor("northwind", login("teacher", 0, 1));
    const file = await teacher.api.files.initiate({
      purpose: "document_media",
      name: "worksheet.txt",
      mediaType: "text/plain",
      sizeBytes: 9,
    });
    await raw("northwind", teacher.token, `/v1/files/${file.id}/content`, {
      method: "PUT",
      body: text("worksheet"),
    });
    const { classes } = await teacher.api.coursework.options();
    const [target, other] = classes.filter(
      (row) => row.classType === "scheduled",
    );
    if (!target || !other)
      throw new Error("the teacher has fewer than two scheduled classes");
    const brief = (title: string, classId = target.id) => ({
      classId,
      title,
      brief: withFile(file.id, `${title}.`),
      audience: "class" as const,
      latePolicy: "accept" as const,
      submissionFormat: "both" as const,
      points: 10,
      rubric: null,
    });
    const first = await teacher.api.coursework.save(brief("First use"));
    const second = await teacher.api.coursework.save(
      brief("Second use", other.id),
    );
    const fileIn = async (id: string) => {
      const opened = await teacher.api.coursework.editor({ id });
      return opened.brief?.root.children?.find((node) => node.type === "file")
        ?.fileId;
    };
    expect(await fileIn(first.id)).toBe(file.id);
    const copied = await fileIn(second.id);
    expect(copied).toBeDefined();
    expect(copied).not.toBe(file.id);
    const again = await teacher.api.coursework.save({
      ...brief("Second use", other.id),
      id: second.id,
      expectedVersion: second.version,
    });
    expect(again.id).toBe(second.id);
    expect(await fileIn(second.id)).toBe(copied);
    const read = await raw(
      "northwind",
      teacher.token,
      `/v1/files/${copied ?? ""}/content`,
    );
    expect(await read.text()).toBe("worksheet");
  });

  test("a file deleted from a class's files waits in the trash for 30 days", async () => {
    const teacher = await sessionFor("northwind", login("teacher", 0, 1));
    const file = await teacher.api.files.initiate({
      purpose: "document_media",
      name: "worksheet.txt",
      mediaType: "text/plain",
      sizeBytes: 9,
    });
    await raw("northwind", teacher.token, `/v1/files/${file.id}/content`, {
      method: "PUT",
      body: text("worksheet"),
    });
    const { classes } = await teacher.api.coursework.options();
    const target = classes.find((row) => row.classType === "scheduled");
    if (!target) throw new Error("the teacher has no scheduled class");
    const fields = {
      classId: target.id,
      title: "Trashed worksheet",
      audience: "class" as const,
      latePolicy: "accept" as const,
      submissionFormat: "both" as const,
      points: 10,
      rubric: null,
    };
    const saved = await teacher.api.coursework.save({
      ...fields,
      brief: withFile(file.id, "With the worksheet."),
    });
    await teacher.api.coursework.save({
      ...fields,
      id: saved.id,
      expectedVersion: saved.version,
      brief: plainContent("Without it."),
    });
    const area = { type: "class" as const, id: target.id };
    const listed = await teacher.api.files.area({ area, trashed: false });
    expect(listed.files.some((row) => row.id === file.id)).toBe(true);
    await teacher.api.files.trashInArea({ area, id: file.id, trashed: true });
    const { cell, files, tenants } = seeded();
    const tenantId = tenants[0]?.tenantId ?? "";
    const day = 24 * 60 * 60 * 1000;
    const path = `/v1/files/${file.id}/content`;
    const inTrash = async () =>
      (await teacher.api.files.area({ area, trashed: true })).files.some(
        (row) => row.id === file.id,
      );
    expect((await raw("northwind", teacher.token, path)).status).toBe(404);
    await sweepTenantFiles(
      cell,
      files,
      tenantId,
      new Date(Date.now() + 29 * day),
    );
    expect(await inTrash()).toBe(true);
    await teacher.api.files.trashInArea({ area, id: file.id, trashed: false });
    expect((await raw("northwind", teacher.token, path)).status).toBe(200);
    await teacher.api.files.trashInArea({ area, id: file.id, trashed: true });
    const swept = await sweepTenantFiles(
      cell,
      files,
      tenantId,
      new Date(Date.now() + 31 * day),
    );
    expect(swept.trashed).toBeGreaterThanOrEqual(1);
    expect(await inTrash()).toBe(false);
    expect(
      await rejection(
        teacher.api.files.trashInArea({ area, id: file.id, trashed: false }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
  });
});

const readFile = (token: string, id: string) =>
  raw("northwind", token, `/v1/files/${id}/content`);

describe("replacing a file in a class's files", () => {
  test("shows the new bytes everywhere, keeps the old ones 30 days, and restores them", async () => {
    const teacher = await sessionFor("northwind", login("teacher", 0, 1));
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const media = async (name: string, body: string, mediaType: string) => {
      const file = await teacher.api.files.initiate({
        purpose: "document_media",
        name,
        mediaType,
        sizeBytes: text(body).size,
      });
      const put = await raw(
        "northwind",
        teacher.token,
        `/v1/files/${file.id}/content`,
        { method: "PUT", body: text(body) },
      );
      expect(put.status).toBe(200);
      return file.id;
    };
    const { classes } = await teacher.api.coursework.options();
    let classId = "";
    for (const row of classes.filter((item) => item.classType === "scheduled"))
      if (
        (await teacher.api.coursework.groups({ classId: row.id })).roster.some(
          (pupil) => pupil.id === me.id,
        )
      )
        classId = row.id;
    const first = await media("worksheet.txt", "version one", "text/plain");
    const saved = await teacher.api.coursework.save({
      classId,
      title: "Replaced worksheet",
      brief: withFile(first, "Fill in the worksheet."),
      audience: "class",
      latePolicy: "accept",
      submissionFormat: "both",
      points: 10,
      rubric: null,
    });
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const area = { type: "class" as const, id: classId };

    const pdf = await media(
      "worksheet.pdf",
      "%PDF-1.4\n%%EOF\n",
      "application/pdf",
    );
    expect(
      await rejection(
        teacher.api.files.replaceInArea({ area, id: first, sourceId: pdf }),
      ),
    ).toMatchObject({ message: "file.replace_kind" });

    const second = await media("worksheet v2.txt", "version two", "text/plain");
    await teacher.api.files.replaceInArea({
      area,
      id: first,
      sourceId: second,
    });
    expect(await (await readFile(student.token, first)).text()).toBe(
      "version two",
    );
    expect(
      (await student.api.files.facts({ ids: [first] })).files[0]?.name,
    ).toBe("worksheet v2.txt");
    const { versions } = await teacher.api.files.versions({ area, id: first });
    expect(versions.map((row) => row.name)).toEqual(["worksheet.txt"]);
    const old = versions[0]?.id ?? "";
    expect(await (await readFile(teacher.token, old)).text()).toBe(
      "version one",
    );
    expect((await readFile(student.token, old)).status).toBe(404);

    await teacher.api.files.replaceInArea({ area, id: first, sourceId: old });
    expect(await (await readFile(student.token, first)).text()).toBe(
      "version one",
    );
    const after = await teacher.api.files.versions({ area, id: first });
    expect(after.versions.map((row) => row.name)).toEqual(["worksheet v2.txt"]);

    const { cell, files, tenants } = seeded();
    await sweepTenantFiles(
      cell,
      files,
      tenants[0]?.tenantId ?? "",
      new Date(Date.now() + 31 * 24 * 60 * 60 * 1000),
    );
    expect(
      (await teacher.api.files.versions({ area, id: first })).versions,
    ).toEqual([]);
    expect(await (await readFile(student.token, first)).text()).toBe(
      "version one",
    );
  });
});

const declare = (
  api: Awaited<ReturnType<typeof sessionFor>>["api"],
  sizeBytes: number,
  destination?: { type: "class" | "module" | "work"; id: string },
  purpose: "document_media" | "submission" = "document_media",
) =>
  api.files.initiate({
    purpose,
    name: "notes.txt",
    mediaType: "text/plain",
    sizeBytes,
    destination,
  });

describe("storage caps", () => {
  test("refuse what a class, a person or the school has no room for, warn near the limit, and never refuse a hand-in", async () => {
    const teacher = await sessionFor("northwind", login("teacher", 0, 1));
    const student = await sessionFor("northwind", login("student"));
    const school = seeded().tenants[0]?.schools.find(
      (row) => row.slug === "northwind",
    );
    if (!school) throw new Error("no northwind school");
    const me = await student.api.identity.currentUser();
    const { classes } = await teacher.api.coursework.options();
    let target: (typeof classes)[number] | undefined;
    for (const row of classes.filter((item) => item.classType === "scheduled"))
      if (
        (await teacher.api.coursework.groups({ classId: row.id })).roster.some(
          (pupil) => pupil.id === me.id,
        )
      )
        target = row;
    if (!target)
      throw new Error("the student is in none of the teacher's classes");
    const area = { type: "class" as const, id: target.id };
    const { usedBytes } = (
      await teacher.api.files.area({ area, trashed: false })
    ).files.reduce(
      (sum, file) => ({ usedBytes: sum.usedBytes + file.sizeBytes }),
      { usedBytes: 0 },
    );
    try {
      await setPlan(school.id, { classBytes: usedBytes + 1000 });
      expect(await declare(teacher.api, 10, area)).toMatchObject({
        warning: null,
      });
      expect((await declare(teacher.api, 900, area)).warning).toMatchObject({
        scope: "class",
      });
      expect(await rejection(declare(teacher.api, 2000, area))).toMatchObject({
        message: "file.quota_class",
      });

      await setPlan(school.id, { personBytes: 1 });
      expect(
        await rejection(declare(student.api, 50, undefined, "submission")),
      ).toMatchObject({ message: "file.quota_person" });
      const work = await teacher.api.coursework.save({
        classId: target.id,
        title: "Room for hand-ins",
        brief: plainContent("Hand in your notes."),
        audience: "class",
        latePolicy: "accept",
        submissionFormat: "both",
        points: 10,
        rubric: null,
      });
      await teacher.api.coursework.publish({
        id: work.id,
        expectedVersion: work.version,
      });
      expect(
        (await declare(student.api, 50, { type: "work", id: work.id })).warning,
      ).toBeNull();

      await setPlan(school.id, { poolBytes: 1 });
      expect(await rejection(declare(teacher.api, 10))).toMatchObject({
        message: "file.quota_school",
      });
    } finally {
      await setPlan(school.id, null);
    }
  });
});

describe("storage reports", () => {
  test("give the directory each school's storage, counting shared bytes once", async () => {
    const { cell, directory, tenants } = seeded();
    const tenantId = tenants[0]?.tenantId ?? "";
    const { syncUrl, adminUrl } = testDirectory();
    const sync = openDirectorySync(syncUrl);
    const admin = new SQL(adminUrl);
    try {
      await reportTenantUsage(cell, directory, sync, tenantId);
      const rows = await admin<
        { school_id: string; used_bytes: string; measured_at: Date }[]
      >`select school_id, used_bytes, measured_at from school_usage`;
      const schools = tenants[0]?.schools.map((row) => row.id) ?? [];
      expect(rows.map((row) => row.school_id).toSorted()).toEqual(
        schools.toSorted(),
      );
      const measured = await cell.withWorker(
        { tenantId, requestId: crypto.randomUUID(), actor: { kind: "system" } },
        "read",
        (tx) =>
          tx.execute<{ org_id: string; bytes: string }>(sql`
            select org_id, sum(size_bytes) as bytes from (
              select distinct on (org_id, storage_key) org_id, size_bytes from core.files
              where tenant_id = ${tenantId}::uuid and status = 'active'
                and state in ('initiated', 'quarantined', 'ready') and org_id is not null
              order by org_id, storage_key) objects
            group by org_id`),
      );
      for (const row of rows)
        expect(Number(row.used_bytes)).toBe(
          Number(
            measured.find((item) => item.org_id === row.school_id)?.bytes ?? 0,
          ),
        );
    } finally {
      await sync.close();
      await admin.close();
    }
  });
});
