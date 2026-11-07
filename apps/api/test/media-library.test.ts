import type { ContentDocument } from "@faridalms/domain/content";

import { plainContent } from "@faridalms/domain/content-conversion";
import { describe, expect, test } from "bun:test";

import { login, raw, rejection, sessionFor } from "./harness";

type Session = Awaited<ReturnType<typeof sessionFor>>;

const png = (extra = 0) =>
  new Blob([
    new Uint8Array([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      ...Array.from({ length: 2 + extra }, () => 0),
    ]),
  ]);

async function uploadPicture(session: Session, name: string, body = png()) {
  const file = await session.api.files.initiate({
    purpose: "document_media",
    name,
    mediaType: "image/png",
    sizeBytes: body.size,
  });
  const put = await raw(
    "northwind",
    session.token,
    `/v1/files/${file.id}/content`,
    { method: "PUT", body },
  );
  expect(put.status).toBe(200);
  return file.id;
}

/** Whether a file opens for someone; a picture answers with its sealed link. */
async function opens(session: Session, id: string) {
  const { status } = await raw(
    "northwind",
    session.token,
    `/v1/files/${id}/content`,
  );
  expect([200, 302, 404]).toContain(status);
  return status !== 404;
}

function withPicture(fileId: string, alt: string): ContentDocument {
  const document = plainContent("See the picture.");
  document.root.children?.push({
    type: "image",
    version: 1,
    format: "",
    fileId,
    alt,
  });
  return document;
}

const pictureIn = (content: ContentDocument | null | undefined) =>
  content?.root.children?.find((node) => node.type === "image")?.fileId;

describe("the media library", () => {
  test("keeps uploads in folders, finds them by description, and is the school's staff's alone", async () => {
    const office = await sessionFor("northwind", login("principal"));
    const sports = await office.api.mediaLibrary.createFolder({
      name: "Sports day",
    });
    const relay = await office.api.mediaLibrary.createFolder({
      name: "Relay",
      parentId: sports.id,
    });
    const id = await uploadPicture(office, "finish-line.png");
    expect(
      await office.api.mediaLibrary.add({ ids: [id], folderId: relay.id }),
    ).toEqual({ ids: [id] });
    await office.api.mediaLibrary.describe({
      id,
      name: "Finish line.png",
      description: "Grade 4 crossing the finish line",
      credit: { author: "Salama Ashoush", licence: "" },
    });

    const inRelay = await office.api.mediaLibrary.list({ folderId: relay.id });
    expect(inRelay.path.map((folder) => folder.name)).toEqual([
      "Sports day",
      "Relay",
    ]);
    expect(inRelay.items.rows.map((row) => row.id)).toEqual([id]);
    expect(inRelay.items.rows[0]).toMatchObject({
      name: "Finish line.png",
      description: "Grade 4 crossing the finish line",
      credit: { author: "Salama Ashoush" },
      uses: 0,
    });
    expect(inRelay.keeper).toBe(true);
    const top = await office.api.mediaLibrary.list({});
    expect(top.children.map((folder) => folder.id)).toContain(sports.id);
    expect(top.items.rows.some((row) => row.id === id)).toBe(false);
    // A search looks in every folder, by the words describing an item too.
    const found = await office.api.mediaLibrary.list({ q: "crossing" });
    expect(found.items.rows.map((row) => row.id)).toContain(id);
    expect(found.children).toEqual([]);

    expect(
      await rejection(office.api.mediaLibrary.removeFolder({ id: relay.id })),
    ).toMatchObject({ message: "media.folder_not_empty" });
    await office.api.mediaLibrary.move({ ids: [id], folderId: null });
    await office.api.mediaLibrary.removeFolder({ id: relay.id });
    expect(
      (await office.api.mediaLibrary.list({})).items.rows.map((row) => row.id),
    ).toContain(id);

    // A teacher chooses from it and adds to it, but does not keep it.
    const teacher = await sessionFor("northwind", login("teacher"));
    expect(
      (await teacher.api.mediaLibrary.list({ q: "crossing" })).keeper,
    ).toBe(false);
    expect(await opens(teacher, id)).toBe(true);
    expect(
      await rejection(teacher.api.mediaLibrary.trash({ id, trashed: true })),
    ).toMatchObject({ code: "FORBIDDEN" });
    expect(
      await rejection(teacher.api.mediaLibrary.createFolder({ name: "Mine" })),
    ).toMatchObject({ code: "FORBIDDEN" });

    // A family reads nothing of it that no document shows them.
    const parent = await sessionFor("northwind", login("parent"));
    expect(await rejection(parent.api.mediaLibrary.list({}))).toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await opens(parent, id)).toBe(false);
  });

  test("a picture chosen into a document is shown where it is and opens for that document's readers", async () => {
    const office = await sessionFor("northwind", login("principal"));
    const teacher = await sessionFor("northwind", login("teacher", 0, 1));
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const chosen = await uploadPicture(office, "volcano.png");
    const unchosen = await uploadPicture(office, "glacier.png");
    await office.api.mediaLibrary.add({ ids: [chosen, unchosen] });

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
      title: "Volcanoes",
      brief: withPicture(chosen, "A volcano erupting"),
      audience: "class",
      latePolicy: "accept",
      submissionFormat: "both",
      points: 10,
      rubric: null,
    });
    // The brief keeps the library's own file, not a copy of it.
    const opened = await teacher.api.coursework.editor({ id: saved.id });
    expect(pictureIn(opened.brief)).toBe(chosen);

    expect(await opens(student, chosen)).toBe(false);
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    expect(await opens(student, chosen)).toBe(true);
    expect(await opens(student, unchosen)).toBe(false);
    expect(await rejection(student.api.mediaLibrary.list({}))).toMatchObject({
      code: "FORBIDDEN",
    });

    const { uses } = await office.api.mediaLibrary.uses({ id: chosen });
    expect(uses).toEqual([
      {
        hostType: "assignment",
        hostId: saved.id,
        titleEn: "Volcanoes",
        titleAr: "Volcanoes",
      },
    ]);
    const listed = await office.api.mediaLibrary.list({ q: "volcano" });
    expect(listed.items.rows.find((row) => row.id === chosen)?.uses).toBe(1);

    // Deleted from the library, it is removed from the brief too, and the
    // brief still saves; restored, it shows again.
    await office.api.mediaLibrary.trash({ id: chosen, trashed: true });
    expect(await opens(student, chosen)).toBe(false);
    const again = await teacher.api.coursework.save({
      id: saved.id,
      expectedVersion: (await teacher.api.coursework.editor({ id: saved.id }))
        .version,
      classId,
      title: "Volcanoes",
      brief: withPicture(chosen, "A volcano erupting"),
      audience: "class",
      latePolicy: "accept",
      submissionFormat: "both",
      points: 10,
      rubric: null,
    });
    expect(again.id).toBe(saved.id);
    const trashed = await office.api.mediaLibrary.list({ trashed: true });
    expect(trashed.items.rows.map((row) => row.id)).toContain(chosen);
    await office.api.mediaLibrary.trash({ id: chosen, trashed: false });
    expect(await opens(student, chosen)).toBe(true);

    // A trashed item nobody showed yet cannot be put in a document.
    await office.api.mediaLibrary.trash({ id: unchosen, trashed: true });
    expect(
      await rejection(
        teacher.api.coursework.save({
          classId,
          title: "Glaciers",
          brief: withPicture(unchosen, "A glacier"),
          audience: "class",
          latePolicy: "accept",
          submissionFormat: "both",
          points: 10,
          rubric: null,
        }),
      ),
    ).toMatchObject({ message: "file.not_attachable" });
  });

  test("a crop is kept as a new item beside its original, saying what it says", async () => {
    const office = await sessionFor("northwind", login("principal"));
    const original = await uploadPicture(office, "hall.png");
    await office.api.mediaLibrary.add({ ids: [original] });
    await office.api.mediaLibrary.describe({
      id: original,
      name: "hall.png",
      description: "The assembly hall",
      credit: null,
    });
    const cut = await uploadPicture(office, "hall-cut.png", png(4));
    const { id } = await office.api.mediaLibrary.crop({
      sourceId: original,
      fileId: cut,
      ratio: "16:9",
    });
    expect(id).toBe(cut);
    const { items } = await office.api.mediaLibrary.items({
      ids: [original, cut],
    });
    expect(items.find((item) => item.id === cut)).toMatchObject({
      name: "hall (16x9).png",
      description: "The assembly hall",
    });
    expect(items.find((item) => item.id === original)).toMatchObject({
      name: "hall.png",
      sizeBytes: png().size,
    });
    // A crop is of a library picture, from the cropper's own new upload.
    const teacher = await sessionFor("northwind", login("teacher"));
    const stranger = await uploadPicture(teacher, "elsewhere.png");
    expect(
      await rejection(
        office.api.mediaLibrary.crop({
          sourceId: original,
          fileId: stranger,
          ratio: "1:1",
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
  });

  test("a picture shown in a document is kept in the library with its words", async () => {
    const office = await sessionFor("northwind", login("principal"));
    const id = await uploadPicture(office, "trip.png");
    const kept = await office.api.mediaLibrary.keep({
      fileId: id,
      description: "The museum trip",
    });
    expect(kept.id).not.toBe(id);
    const { items } = await office.api.mediaLibrary.items({ ids: [kept.id] });
    expect(items[0]).toMatchObject({ description: "The museum trip" });
    expect(await office.api.mediaLibrary.keep({ fileId: kept.id })).toEqual({
      id: kept.id,
    });
    const parent = await sessionFor("northwind", login("parent"));
    expect(
      await rejection(parent.api.mediaLibrary.keep({ fileId: id })),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});
