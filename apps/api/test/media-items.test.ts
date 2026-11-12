import type { ContentDocument } from "@faridalms/domain/content";

import { plainContent } from "@faridalms/domain/content-conversion";
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { unzipSync } from "fflate";

import {
  login,
  PART_BYTES,
  raw,
  rejection,
  seeded,
  sessionFor,
} from "./harness";

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

/** A picture of its own bytes, so no other upload shares them. */
const uniquePng = () =>
  new Blob([png(), new TextEncoder().encode(crypto.randomUUID())]);

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

describe("the school's media", () => {
  test("keeps uploads in folders, finds them by description, and is the school's staff's alone", async () => {
    const office = await sessionFor("northwind", login("principal"));
    const sports = await office.api.media.createFolder({
      name: "Sports day",
    });
    const relay = await office.api.media.createFolder({
      name: "Relay",
      parentId: sports.id,
    });
    const id = await uploadPicture(office, "finish-line.png");
    expect(
      await office.api.media.add({ ids: [id], folderId: relay.id }),
    ).toEqual({ ids: [id], twins: [] });
    await office.api.media.describe({
      id,
      name: "Finish line.png",
      description: "Grade 4 crossing the finish line",
      credit: { author: "Salama Ashoush", licence: "" },
    });

    const inRelay = await office.api.media.list({ folderId: relay.id });
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
    const top = await office.api.media.list({});
    expect(top.children.map((folder) => folder.id)).toContain(sports.id);
    expect(top.items.rows.some((row) => row.id === id)).toBe(false);
    // A search looks in every folder, by the words describing an item too.
    const found = await office.api.media.list({ q: "crossing" });
    expect(found.items.rows.map((row) => row.id)).toContain(id);
    expect(found.children).toEqual([]);

    expect(
      await rejection(office.api.media.removeFolder({ id: relay.id })),
    ).toMatchObject({ message: "media.folder_not_empty" });
    await office.api.media.move({ ids: [id], folderId: null });
    await office.api.media.removeFolder({ id: relay.id });
    expect(
      (await office.api.media.list({})).items.rows.map((row) => row.id),
    ).toContain(id);

    // A teacher chooses from it and adds to it, but does not keep it.
    const teacher = await sessionFor("northwind", login("teacher"));
    expect((await teacher.api.media.list({ q: "crossing" })).keeper).toBe(
      false,
    );
    expect(await opens(teacher, id)).toBe(true);
    expect(
      await rejection(teacher.api.media.trash({ id, trashed: true })),
    ).toMatchObject({ code: "FORBIDDEN" });
    expect(
      await rejection(teacher.api.media.createFolder({ name: "Mine" })),
    ).toMatchObject({ code: "FORBIDDEN" });

    // A family reads nothing of it that no document shows them.
    const parent = await sessionFor("northwind", login("parent"));
    expect(await rejection(parent.api.media.list({}))).toMatchObject({
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
    await office.api.media.add({ ids: [chosen, unchosen] });

    const { classes } = await teacher.api.coursework.options();
    let classId = "";
    for (const row of classes.filter((item) => item.subjectId !== null)) {
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
    // The brief keeps the media item's own file, not a copy of it.
    const opened = await teacher.api.coursework.editor({ id: saved.id });
    expect(pictureIn(opened.brief)).toBe(chosen);

    expect(await opens(student, chosen)).toBe(false);
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    expect(await opens(student, chosen)).toBe(true);
    expect(await opens(student, unchosen)).toBe(false);
    expect(await rejection(student.api.media.list({}))).toMatchObject({
      code: "FORBIDDEN",
    });

    const { uses } = await office.api.media.uses({ id: chosen });
    expect(uses).toEqual([
      {
        hostType: "assignment",
        hostId: saved.id,
        titleEn: "Volcanoes",
        titleAr: "Volcanoes",
      },
    ]);
    const listed = await office.api.media.list({ q: "volcano" });
    expect(listed.items.rows.find((row) => row.id === chosen)?.uses).toBe(1);

    // Deleted from media, it is removed from the brief too, and the
    // brief still saves; restored, it shows again.
    await office.api.media.trash({ id: chosen, trashed: true });
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
    const trashed = await office.api.media.list({ trashed: true });
    expect(trashed.items.rows.map((row) => row.id)).toContain(chosen);
    await office.api.media.trash({ id: chosen, trashed: false });
    expect(await opens(student, chosen)).toBe(true);

    // A trashed item nobody showed yet cannot be put in a document.
    await office.api.media.trash({ id: unchosen, trashed: true });
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
    await office.api.media.add({ ids: [original] });
    await office.api.media.describe({
      id: original,
      name: "hall.png",
      description: "The assembly hall",
      credit: null,
    });
    const cut = await uploadPicture(office, "hall-cut.png", png(4));
    const { id } = await office.api.media.crop({
      sourceId: original,
      fileId: cut,
      ratio: "16:9",
    });
    expect(id).toBe(cut);
    const { items } = await office.api.media.items({
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
    // A crop is of a media picture, from the cropper's own new upload.
    const teacher = await sessionFor("northwind", login("teacher"));
    const stranger = await uploadPicture(teacher, "elsewhere.png");
    expect(
      await rejection(
        office.api.media.crop({
          sourceId: original,
          fileId: stranger,
          ratio: "1:1",
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
  });

  test("a picture shown in a document is kept in media with its words", async () => {
    const office = await sessionFor("northwind", login("principal"));
    const id = await uploadPicture(office, "trip.png");
    const kept = await office.api.media.keep({
      fileId: id,
      description: "The museum trip",
    });
    expect(kept.id).not.toBe(id);
    const { items } = await office.api.media.items({ ids: [kept.id] });
    expect(items[0]).toMatchObject({ description: "The museum trip" });
    expect(await office.api.media.keep({ fileId: kept.id })).toEqual({
      id: kept.id,
    });
    const parent = await sessionFor("northwind", login("parent"));
    expect(
      await rejection(parent.api.media.keep({ fileId: id })),
    ).toMatchObject({ code: "FORBIDDEN" });
  });

  test("items carry a title, a caption and tags, and are found, filtered and deleted by them", async () => {
    const office = await sessionFor("northwind", login("principal"));
    const relay = await uploadPicture(office, "IMG_0001.png", uniquePng());
    const choir = await uploadPicture(office, "IMG_0002.png", uniquePng());
    await office.api.media.add({ ids: [relay, choir] });
    await office.api.media.describe({
      id: relay,
      name: "IMG_0001.png",
      title: "Relay final",
      description: "Runners at the line",
      caption: "Year 7 won the relay.",
      credit: null,
    });
    const tagged = await office.api.media.tag({
      ids: [relay, choir],
      add: ["Sports day", "sports DAY", "2026"],
    });
    expect(tagged.tags.map((tag) => tag.name).toSorted()).toEqual([
      "2026",
      "Sports day",
    ]);
    const sports = tagged.tags.find((tag) => tag.name === "Sports day");
    if (!sports) throw new Error("the tag was made");
    const year = tagged.tags.find((tag) => tag.name === "2026");
    if (!year) throw new Error("the tag was made");
    await office.api.media.tag({ ids: [choir], remove: [year.id] });

    const { items } = await office.api.media.items({ ids: [relay] });
    expect(items[0]).toMatchObject({
      name: "IMG_0001.png",
      title: "Relay final",
      caption: "Year 7 won the relay.",
    });
    // A search reads titles and captions; tags narrow to items carrying all.
    const byCaption = await office.api.media.list({
      q: "won the relay",
    });
    expect(byCaption.items.rows.map((row) => row.id)).toEqual([relay]);
    const both = await office.api.media.list({
      tags: [sports.id, year.id],
    });
    expect(both.items.rows.map((row) => row.id)).toEqual([relay]);
    const me = await office.api.identity.currentUser();
    const mine = await office.api.media.list({
      uploaders: [me.id],
      tags: [sports.id],
    });
    expect(mine.items.rows.map((row) => row.id).toSorted()).toEqual(
      [relay, choir].toSorted(),
    );
    expect(mine.facets.tags.find((tag) => tag.id === sports.id)?.count).toBe(2);
    const month = mine.facets.months[0]?.month ?? "";
    expect(month).toMatch(/^\d{4}-\d{2}$/);
    expect(
      (
        await office.api.media.list({
          months: [month],
          tags: [sports.id],
        })
      ).items.total,
    ).toBe(2);
    expect(
      (await office.api.media.list({ months: ["2001-01"] })).items.total,
    ).toBe(0);

    // A teacher uses media but does not keep it.
    const teacher = await sessionFor("northwind", login("teacher"));
    expect(
      await rejection(teacher.api.media.tag({ ids: [relay], add: ["Mine"] })),
    ).toMatchObject({ code: "FORBIDDEN" });

    await office.api.media.renameTag({ id: year.id, name: "Year 2026" });
    await office.api.media.trashMany({
      ids: [relay, choir],
      trashed: true,
    });
    const trashed = await office.api.media.list({ trashed: true });
    expect(trashed.items.rows.map((row) => row.id)).toEqual(
      expect.arrayContaining([relay, choir]),
    );
    await office.api.media.removeTag({ id: sports.id });
    await office.api.media.trashMany({ ids: [relay], trashed: false });
    const back = await office.api.media.items({ ids: [relay] });
    expect(back.items[0]?.tags.map((tag) => tag.name)).toEqual(["Year 2026"]);

    // Each change is recorded against the item.
    const { cell, tenants } = seeded();
    const tenantId = tenants[0]?.tenantId ?? "";
    const actions = await cell.withWorker(
      { tenantId, requestId: crypto.randomUUID(), actor: { kind: "system" } },
      "read",
      (tx) =>
        tx.execute<{ action: string }>(
          sql`select action from audit.log
            where tenant_id = ${tenantId}::uuid and object_id = ${relay}::uuid`,
        ),
    );
    expect(actions.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        "media.item_add",
        "media.item_describe",
        "media.item_tag",
        "file.trashed",
        "file.restored",
      ]),
    );
  });

  test("replacing an item's file keeps every place showing it, and keeps the old file as a version", async () => {
    const office = await sessionFor("northwind", login("principal"));
    const item = await uploadPicture(office, "map.png", uniquePng());
    await office.api.media.add({ ids: [item] });
    await office.api.media.describe({
      id: item,
      name: "map.png",
      description: "The school grounds",
      credit: null,
    });
    const newer = await uploadPicture(office, "map-2026.png", uniquePng());
    await office.api.media.replace({ id: item, sourceId: newer });
    const { items } = await office.api.media.items({ ids: [item] });
    expect(items[0]).toMatchObject({
      id: item,
      name: "map-2026.png",
      description: "The school grounds",
    });
    const { versions } = await office.api.media.versions({ id: item });
    expect(versions.map((version) => version.name)).toEqual(["map.png"]);
    await office.api.media.replace({
      id: item,
      sourceId: versions[0]?.id ?? "",
    });
    expect((await office.api.media.items({ ids: [item] })).items[0]?.name).toBe(
      "map.png",
    );

    // Only the same kind of file stands in.
    const notes = await office.api.files.initiate({
      purpose: "document_media",
      name: "notes.txt",
      mediaType: "text/plain",
      sizeBytes: 5,
    });
    await raw("northwind", office.token, `/v1/files/${notes.id}/content`, {
      method: "PUT",
      body: "notes",
    });
    expect(
      await rejection(
        office.api.media.replace({ id: item, sourceId: notes.id }),
      ),
    ).toMatchObject({ message: "file.replace_kind" });
    const teacher = await sessionFor("northwind", login("teacher"));
    expect(
      await rejection(teacher.api.media.versions({ id: item })),
    ).toMatchObject({ code: "FORBIDDEN" });
  });

  test("the same bytes uploaded again share one stored object, and media names the twin", async () => {
    const office = await sessionFor("northwind", login("principal"));
    const bytes = uniquePng();
    const first = await uploadPicture(office, "logo.png", bytes);
    const added = await office.api.media.add({ ids: [first] });
    expect(added.twins).toEqual([]);
    const { cell, tenants } = seeded();
    const tenantId = tenants[0]?.tenantId ?? "";
    const keys = (ids: string[]) =>
      cell.withWorker(
        { tenantId, requestId: crypto.randomUUID(), actor: { kind: "system" } },
        "read",
        (tx) =>
          tx.execute<{ id: string; storage_key: string }>(
            sql`select id, storage_key from core.files
              where tenant_id = ${tenantId}::uuid and id = any(${`{${ids.join(",")}}`}::uuid[])`,
          ),
      );
    const second = await uploadPicture(office, "logo copy.png", bytes);
    const stored = await keys([first, second]);
    expect(new Set(stored.map((row) => row.storage_key)).size).toBe(1);
    expect(await opens(office, second)).toBe(true);
    const again = await office.api.media.add({ ids: [second] });
    expect(again.twins).toEqual([
      { id: second, twinId: first, twinName: "logo.png" },
    ]);
    // Deleting one for good leaves the other's bytes in place.
    await office.api.media.trash({ id: first, trashed: true });
    expect(await opens(office, second)).toBe(true);
  });

  test("uploads staff made in documents are offered for keeping, never a student's work", async () => {
    const office = await sessionFor("northwind", login("principal"));
    const inNews = await uploadPicture(office, "assembly.png", uniquePng());
    await office.api.announcements.save({
      id: "",
      expectedVersion: 0,
      visibility: "school",
      primaryLocale: "en",
      titleEn: "Assembly",
      titleAr: "",
      excerptEn: "",
      excerptAr: "",
      slug: "",
      categoryId: "",
      coverFileId: "",
      coverAltEn: "",
      coverAltAr: "",
      pinned: false,
      urgency: "normal",
      pinnedUntil: "",
      expiresOn: "",
      requiresAck: false,
      ackDueOn: "",
      audiences: [{ scope: "families", classId: "", gradeId: "" }],
      body: withPicture(inNews, "The assembly"),
      translation: null,
    });
    const listed = await office.api.media.inDocuments({});
    const offered = listed.items.rows.find((row) => row.id === inNews);
    expect(offered).toMatchObject({ name: "assembly.png" });

    const kept = await office.api.media.keep({ fileId: inNews });
    expect(kept.id).not.toBe(inNews);
    const after = await office.api.media.inDocuments({});
    expect(after.items.rows.some((row) => row.id === inNews)).toBe(false);

    const parent = await sessionFor("northwind", login("parent"));
    expect(await rejection(parent.api.media.inDocuments({}))).toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("a picture found on Wikimedia Commons comes in with its words and credit", async () => {
    const office = await sessionFor("northwind", login("principal"));
    const id = await uploadPicture(office, "camel.png", uniquePng());
    const credit = {
      author: "A. Photographer",
      licence: "CC BY-SA 4.0",
      source: "https://commons.wikimedia.org/wiki/File:Camel.jpg",
    };
    expect(
      await rejection(
        office.api.media.add({
          ids: [id, id],
          found: { description: "A camel", credit },
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
    await office.api.media.add({
      ids: [id],
      found: { description: "A camel resting in the desert", credit },
    });
    const found = await office.api.media.list({ q: "camel" });
    expect(found.items.rows.find((row) => row.id === id)).toMatchObject({
      description: "A camel resting in the desert",
      credit,
    });
  });

  test("storage is shown by kind and by person to those who keep media", async () => {
    const office = await sessionFor("northwind", login("principal"));
    const storage = await office.api.media.storage();
    expect(storage.limitBytes).toBeGreaterThan(0);
    const byKind = storage.kinds.reduce((sum, kind) => sum + kind.usedBytes, 0);
    const byPerson =
      storage.staff.reduce((sum, person) => sum + person.usedBytes, 0) +
      storage.others.usedBytes;
    expect(byKind).toBe(storage.usedBytes);
    expect(byPerson).toBeLessThanOrEqual(storage.usedBytes);
    const teacher = await sessionFor("northwind", login("teacher"));
    expect(await rejection(teacher.api.media.storage())).toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("an upload picked up after a reload sends only the parts the server lacks", async () => {
    const office = await sessionFor("northwind", login("principal"));
    const size = PART_BYTES * 2 + 10;
    const bytes = new Uint8Array(size);
    bytes.set(new Uint8Array(await png().arrayBuffer()));
    const file = await office.api.files.initiate({
      purpose: "document_media",
      name: "poster.png",
      mediaType: "image/png",
      sizeBytes: size,
    });
    const part = (n: number) =>
      raw("northwind", office.token, `/v1/files/${file.id}/parts/${n}`, {
        method: "PUT",
        body: bytes.slice(n * PART_BYTES, (n + 1) * PART_BYTES),
      });
    const state = async () =>
      (
        await raw("northwind", office.token, `/v1/files/${file.id}/parts`)
      ).json();
    expect(await state()).toEqual({ state: "initiated", parts: [] });
    expect((await part(0)).status).toBe(204);
    expect(await state()).toEqual({ state: "initiated", parts: [0] });
    expect((await part(1)).status).toBe(204);
    expect((await part(2)).status).toBe(204);
    expect(await state()).toEqual({ state: "initiated", parts: [0, 1, 2] });
    const joined = await raw(
      "northwind",
      office.token,
      `/v1/files/${file.id}/parts`,
      { method: "POST" },
    );
    expect(joined.status).toBe(200);
    expect(await state()).toEqual({ state: "ready", parts: [] });
    // Someone else's upload says nothing.
    const teacher = await sessionFor("northwind", login("teacher"));
    expect(
      (await raw("northwind", teacher.token, `/v1/files/${file.id}/parts`))
        .status,
    ).toBe(404);
  });

  test("several items download as one zip, and a link to a private address is refused", async () => {
    const office = await sessionFor("northwind", login("principal"));
    const a = await uploadPicture(office, "one.png", uniquePng());
    const b = await uploadPicture(office, "two.png", uniquePng());
    await office.api.media.add({ ids: [a, b] });
    const zipped = await raw(
      "northwind",
      office.token,
      `/v1/media/items.zip?ids=${a},${b}`,
    );
    expect(zipped.status).toBe(200);
    expect(
      Object.keys(
        unzipSync(new Uint8Array(await zipped.arrayBuffer())),
      ).toSorted(),
    ).toEqual(["one.png", "two.png"]);
    const parent = await sessionFor("northwind", login("parent"));
    expect(
      (await raw("northwind", parent.token, `/v1/media/items.zip?ids=${a}`))
        .status,
    ).toBe(404);

    for (const url of [
      "http://127.0.0.1/secret.png",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/x.png",
      "http://localhost:4701/x.png",
    ])
      expect(
        await rejection(office.api.media.importLink({ url })),
      ).toMatchObject({ message: "media.link_address" });
    expect(
      await rejection(
        parent.api.media.importLink({
          url: "https://example.com/a.png",
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});
