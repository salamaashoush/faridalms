import type { ContentDocument } from "@faridalms/domain/content";

import { plainContent } from "@faridalms/domain/content-conversion";
import { describe, expect, test } from "bun:test";

import { sweepTenantFiles } from "../src/files/sweep";
import { login, raw, rejection, seeded, sessionFor, signedIn } from "./harness";

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
  const response = await raw("northwind", token, `/v1/files/${file.id}/content`, {
    method: "PUT",
    body,
  });
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
      (await raw("northwind", teacher.token, `/v1/files/${fake.file.id}/content`))
        .status,
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
      (await raw("northwind", teacher.token, `/v1/files/${kept.file.id}/content`))
        .status,
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
});
