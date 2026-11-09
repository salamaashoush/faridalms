import type { ContentDocument } from "@faridalms/domain/content";

import { openDirectorySync } from "@faridalms/database/directory/client";
import { plainContent } from "@faridalms/domain/content-conversion";
import { WARN_SHARE } from "@faridalms/domain/plans";
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
    // Bytes of its own: an upload sharing another's stored object leaves
    // the object to the other when it goes.
    const file = await teacher.api.files.initiate({
      purpose: "document_media",
      name: "worksheet.txt",
      mediaType: "text/plain",
      sizeBytes: 9,
    });
    await raw("northwind", teacher.token, `/v1/files/${file.id}/content`, {
      method: "PUT",
      body: text("binned it"),
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
    expect(listed.files.rows.some((row) => row.id === file.id)).toBe(true);
    const found = listed.files.rows.find((row) => row.id === file.id);
    if (!found) throw new Error("the worksheet is not listed");
    const named = await teacher.api.files.area({
      area,
      trashed: false,
      q: found.name.slice(0, 6),
    });
    expect(named.files.rows.map((row) => row.id)).toContain(file.id);
    const elsewhere = await teacher.api.files.area({
      area,
      trashed: false,
      kinds: ["audio"],
    });
    expect(elsewhere.files.rows.some((row) => row.id === file.id)).toBe(false);
    expect(listed.files).toMatchObject({ page: 1, pageSize: 25 });
    expect(Object.values(listed.kinds).reduce((sum, n) => sum + n, 0)).toBe(
      listed.files.total,
    );
    await teacher.api.files.trashInArea({ area, id: file.id, trashed: true });
    const { cell, files, tenants } = seeded();
    const tenantId = tenants[0]?.tenantId ?? "";
    const day = 24 * 60 * 60 * 1000;
    const path = `/v1/files/${file.id}/content`;
    const inTrash = async () =>
      (await teacher.api.files.area({ area, trashed: true })).files.rows.some(
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
    // What the class's quota counts, every file it keeps with its versions.
    const { usedBytes } = (
      await teacher.api.files.area({ area, trashed: false })
    ).usage;
    // Other suites may have filled this class already, and the warning is a
    // share of the limit, so the limit and the sizes follow what is there.
    const classBytes = 5 * usedBytes + 5000;
    const nearLimit = Math.ceil(classBytes * WARN_SHARE) - usedBytes;
    try {
      await setPlan(school.id, { classBytes });
      expect(await declare(teacher.api, 10, area)).toMatchObject({
        warning: null,
      });
      expect(
        (await declare(teacher.api, nearLimit, area)).warning,
      ).toMatchObject({ scope: "class" });
      expect(
        await rejection(declare(teacher.api, classBytes - usedBytes + 1, area)),
      ).toMatchObject({ message: "file.quota_class" });

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

describe("usage reports", () => {
  test("count a school's students and staff, and its administrators are told past the students it is entitled to", async () => {
    const { cell, directory, tenants } = seeded();
    const tenantId = tenants[0]?.tenantId ?? "";
    const school = tenants[0]?.schools.find((row) => row.slug === "northwind");
    if (!school) throw new Error("no northwind school");
    const principal = await signedIn("northwind", login("principal"));
    const { syncUrl, adminUrl } = testDirectory();
    const sync = openDirectorySync(syncUrl, "cell:eg-1");
    const admin = new SQL(adminUrl);
    try {
      await reportTenantUsage(cell, directory, sync, tenantId);
      const [row] = await admin<
        {
          students: number;
          staff_accounts: number;
          signed_in_7d: number;
          signed_in_30d: number;
        }[]
      >`select students, staff_accounts, signed_in_7d, signed_in_30d
        from school_usage where school_id = ${school.id}::uuid`;
      const { today } = await principal.identity.currentUser();
      const [placed] = await cell.withWorker(
        { tenantId, requestId: crypto.randomUUID(), actor: { kind: "system" } },
        "read",
        (tx) =>
          tx.execute<{ n: number }>(sql`
            select count(distinct student_user_id)::int as n from core.student_school_years
            where tenant_id = ${tenantId}::uuid and org_id = ${school.id}::uuid
              and status = 'active' and valid_during @> ${today}::date`),
      );
      const enrolled = placed?.n ?? 0;
      expect(enrolled).toBeGreaterThan(0);
      expect(row?.students).toBe(enrolled);
      const days = await admin<{ day: string; sign_ins: number }[]>`
        select day::text, sign_ins from school_usage_daily
        where school_id = ${school.id}::uuid order by day`;
      expect(days.map((item) => item.day)).toContain(today);
      expect(days.find((item) => item.day === today)?.sign_ins).toBeGreaterThan(
        0,
      );
      expect(row?.staff_accounts).toBeGreaterThan(0);
      expect(row?.signed_in_7d).toBeGreaterThan(0);
      expect(row?.signed_in_30d).toBeGreaterThanOrEqual(row?.signed_in_7d ?? 0);

      await setPlan(school.id, { students: enrolled - 1 });
      expect(
        (await principal.identity.currentUser()).contract?.students,
      ).toEqual({ count: enrolled, limit: enrolled - 1 });
    } finally {
      await setPlan(school.id, null);
      await sync.close();
      await admin.close();
    }
  });
});

describe("onboarding reports", () => {
  test("record each step a school has taken from the day it is first seen, and its week of school", async () => {
    const { cell, directory, tenants } = seeded();
    const tenantId = tenants[0]?.tenantId ?? "";
    const school = tenants[0]?.schools.find((row) => row.slug === "northwind");
    if (!school) throw new Error("no northwind school");
    await signedIn("northwind", login("principal"));
    const { syncUrl, adminUrl } = testDirectory();
    const sync = openDirectorySync(syncUrl, "cell:eg-1");
    const admin = new SQL(adminUrl);
    try {
      await reportTenantUsage(cell, directory, sync, tenantId);
      const first = await directory.onboardingOf(school.id);
      expect(first.map((row) => row.item)).toEqual(
        expect.arrayContaining([
          "year_ready",
          "classes",
          "staff_invited",
          "staff_signed_in",
          "students_imported",
          "guardians_linked",
          "timetable_ready",
        ]),
      );
      // Operators' steps and the first invoice are not the cell's to see.
      expect(first.map((row) => row.item)).not.toContain("kickoff_call");
      expect(first.map((row) => row.item)).not.toContain("first_invoice_paid");

      await reportTenantUsage(cell, directory, sync, tenantId);
      const again = await directory.onboardingOf(school.id);
      for (const row of first)
        expect(
          again.find((other) => other.item === row.item)?.reachedAt,
        ).toEqual(row.reachedAt);

      const [usage] = await admin<
        { school_days_7d: number; failed_deliveries_1d: number }[]
      >`select school_days_7d, failed_deliveries_1d from school_usage
        where school_id = ${school.id}::uuid`;
      expect(usage?.school_days_7d).toBeGreaterThanOrEqual(0);
      expect(usage?.school_days_7d).toBeLessThanOrEqual(7);
      expect(usage?.failed_deliveries_1d).toBeGreaterThanOrEqual(0);
    } finally {
      await sync.close();
      await admin.close();
    }
  });
});

describe("storage reports", () => {
  test("give the directory each school's storage, counting shared bytes once", async () => {
    const { cell, directory, tenants } = seeded();
    const tenantId = tenants[0]?.tenantId ?? "";
    const { syncUrl, adminUrl } = testDirectory();
    const sync = openDirectorySync(syncUrl, "cell:eg-1");
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
