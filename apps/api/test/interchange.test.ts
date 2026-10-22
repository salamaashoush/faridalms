import type { LessonBlock } from "@faridalms/domain/learning";

import { contentOfLesson } from "@faridalms/domain/lesson-content";
import { describe, expect, test } from "bun:test";
import { unzipSync } from "fflate";

import { login, raw, seeded, sessionFor } from "./harness";

const TITLE = "Reading stories together";
const PIXEL = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (character) => character.charCodeAt(0),
);

/** A teacher of the seeded module, who may make modules for its classes. */
async function teacherOfModule() {
  const tenant = seeded().tenants[0];
  const school = tenant?.schools.find((row) => row.slug === "northwind");
  for (const row of tenant?.logins ?? []) {
    if (row.role !== "teacher" || row.schoolId !== school?.id) continue;
    const session = await sessionFor("northwind", row.loginName);
    const source = (await session.api.learning.modules({})).rows.find(
      (item) => item.title === TITLE,
    );
    if (source)
      return { session, classIds: source.classes.map((item) => item.id) };
  }
  throw new Error("no teacher of the module");
}

/** A module with one lesson asking the questions given, as its teacher wrote them. */
async function moduleAsking(title: string, blocks: LessonBlock[]) {
  const { session, classIds } = await teacherOfModule();
  const saved = await session.api.learning.saveModule({
    id: "",
    expectedVersion: 0,
    title,
    summary: "",
    classIds,
    prerequisiteId: "",
    sequential: false,
  });
  const content = contentOfLesson({ version: 2, blocks });
  if (!content) throw new Error("no document");
  await session.api.learning.saveLesson({
    id: "",
    moduleId: saved.id,
    expectedVersion: 0,
    title: "The flood",
    completion: "view",
    passScore: null,
    content,
    publish: false,
  });
  return { teacher: session, moduleId: saved.id };
}

const unzipped = async (response: Response) => {
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
  return Object.fromEntries(
    Object.entries(files).map(([name, bytes]) => [
      name,
      name.endsWith(".xml") ? new TextDecoder().decode(bytes) : bytes,
    ]),
  );
};

describe("moving teaching between systems", () => {
  test("a module's questions leave as a QTI 3 package, pictures and all", async () => {
    const { session: probe } = await teacherOfModule();
    const file = await probe.api.files.initiate({
      purpose: "document_media",
      name: "delta.png",
      mediaType: "image/png",
      sizeBytes: PIXEL.byteLength,
    });
    expect(
      (
        await raw("northwind", probe.token, `/v1/files/${file.id}/content`, {
          method: "PUT",
          body: PIXEL,
        })
      ).status,
    ).toBe(200);
    const common = { points: 2, hints: [], explanation: "", tries: null };
    const nile = crypto.randomUUID();
    const { teacher, moduleId } = await moduleAsking("Floods to share", [
      {
        ...common,
        id: crypto.randomUUID(),
        type: "choice",
        prompt: "Which river floods Egypt?",
        options: [
          { id: nile, text: "The Nile", feedback: "" },
          { id: crypto.randomUUID(), text: "The Thames", feedback: "" },
        ],
        correctOptionIds: [nile],
        multiple: false,
        shuffle: true,
      },
      {
        ...common,
        id: crypto.randomUUID(),
        type: "hotspot",
        prompt: "Find the delta.",
        picture: { fileId: file.id, alt: "The delta" },
        places: [{ box: [0, 0, 1, 1], name: "Delta", correct: true }],
      },
    ]);

    const response = await raw(
      "northwind",
      teacher.token,
      `/v1/modules/${moduleId}/questions.zip`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    const files = await unzipped(response);
    expect(Object.keys(files).toSorted()).toEqual([
      "imsmanifest.xml",
      "items/q1.xml",
      "items/q2.xml",
      "media/delta.png",
      "tests/t1.xml",
    ]);
    expect(files["media/delta.png"]).toEqual(PIXEL);
    const manifest = String(files["imsmanifest.xml"]);
    expect(manifest).toContain("<schemaversion>3.0.0</schemaversion>");
    expect(manifest).toContain(
      '<resource identifier="Q2" type="imsqti_item_xmlv3p0" href="items/q2.xml"><file href="items/q2.xml"/><dependency identifierref="MEDIA"/></resource>',
    );
    expect(String(files["items/q1.xml"])).toContain(
      "<qti-correct-response><qti-value>C1</qti-value></qti-correct-response>",
    );
    // The picture's own size places the delta: the whole of a one-pixel picture.
    expect(String(files["items/q2.xml"])).toContain(
      '<img src="../media/delta.png" alt="The delta" width="1" height="1"/><qti-hotspot-choice identifier="H1" shape="rect" coords="0,0,1,1" hotspot-label="Delta"/>',
    );
    expect(String(files["tests/t1.xml"])).toContain(
      '<qti-assessment-item-ref identifier="Q1" href="../items/q1.xml"/>',
    );

    // Only someone who may change the module takes its questions away.
    const pupil = await sessionFor("northwind", login("student"));
    expect(
      (await raw("northwind", pupil.token, `/v1/modules/${moduleId}/questions.zip`))
        .status,
    ).toBe(404);
  });
});
