import type { ContentDocument } from "@faridalms/domain/content";

import {
  headedContent,
  plainContent,
} from "@faridalms/domain/content-conversion";
import { describe, expect, test } from "bun:test";

import { client, login, raw, rejection, sessionFor, signedIn } from "./harness";

const principal = () => signedIn("northwind", login("principal"));
const mother = () =>
  signedIn("northwind", login("student").replace("student", "parent"));

type Office = Awaited<ReturnType<typeof principal>>;
type Family = Awaited<ReturnType<typeof mother>>;

async function purpose(office: Office, code: string) {
  const { purposes } = await office.consents.forms();
  const found = purposes.find((row) => row.code === code);
  if (!found) throw new Error(`the seed has no ${code} purpose`);
  return found;
}

async function firstChild(family: Family) {
  const data = await family.consents.family();
  const child = data.children[0];
  if (!child) throw new Error("the seeded parent has no child");
  return { data, child };
}

/** Sets every guardian link of a student to the same rights, as one court order might. */
async function setRights(
  office: Office,
  studentId: string,
  rights: "full" | "restricted" | "none",
) {
  const { links } = await office.records.custody({ studentId });
  for (const link of links)
    await office.records.saveCustody({
      studentId,
      relationshipId: link.relationshipId,
      expectedVersion: link.version,
      contactRestrictions: link.contactRestrictions ?? "",
      educationalRights: rights,
      communicationIsolated: link.communicationIsolated,
      pickup: link.pickup,
    });
}

describe("consent forms", () => {
  test("the office sees each purpose with its published form and the answers so far", async () => {
    const office = await principal();
    const website = await purpose(office, "photo_school_website");
    expect(website.published?.versionLabel).toBe("1");
    expect(website.granted + website.refused).toBeGreaterThanOrEqual(2);
    const medicine = await purpose(office, "administer_medicine");
    expect(medicine.published).toBeNull();
    expect(medicine.draftId).not.toBeNull();
    const form = await office.consents.form({ purposeId: medicine.id });
    expect(form.draft?.versionLabel).toBe("1");
    expect(form.published).toBeNull();
  });

  test("a published form cannot be edited and a second draft cannot open", async () => {
    const office = await principal();
    const website = await purpose(office, "photo_school_website");
    const draft = {
      id: website.published?.id ?? "",
      expectedVersion: 2,
      purposeId: website.id,
      primaryLocale: "en" as const,
      body: plainContent("Changed words."),
      translation: null,
    };
    expect(await rejection(office.consents.saveForm(draft))).toMatchObject({
      code: "CONFLICT",
    });
    const medicine = await purpose(office, "administer_medicine");
    expect(
      await rejection(
        office.consents.saveForm({
          ...draft,
          id: "",
          expectedVersion: 0,
          purposeId: medicine.id,
        }),
      ),
    ).toMatchObject({ code: "CONFLICT" });
  });

  test("a form is words only", async () => {
    const office = await principal();
    const news = await purpose(office, "photo_school_news");
    const body = headedContent([
      { heading: "Photos", body: plainContent("See the picture.") },
    ]);
    body.root.children?.push({
      type: "image",
      version: 1,
      fileId: crypto.randomUUID(),
      altText: "",
    } as never);
    expect(
      await rejection(
        office.consents.saveForm({
          id: "",
          expectedVersion: 0,
          purposeId: news.id,
          primaryLocale: "en",
          body,
          translation: null,
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("answering for a child", () => {
  test("a legal guardian agrees in the app, then takes it back, and the register keeps both", async () => {
    const family = await mother();
    const { data, child } = await firstChild(family);
    const website = data.forms.find((form) =>
      form.labelEn?.includes("website"),
    );
    if (!website) throw new Error("the website form is not published");
    expect(child.mayAnswer).toBe(true);
    expect(website.body).not.toBeNull();
    expect(website.translation).not.toBeNull();

    const yes = await family.consents.answer({
      studentId: child.studentId,
      noticeId: website.id,
      agreed: true,
    });
    expect(yes.decision).toBe("granted");
    const no = await family.consents.answer({
      studentId: child.studentId,
      noticeId: website.id,
      agreed: false,
    });
    expect(no.decision).toBe("withdrawn");

    const office = await principal();
    const record = await office.consents.student({ id: child.studentId });
    const row = record.purposes.find((item) => item.formId === website.id);
    expect(row?.current?.decision).toBe("withdrawn");
    expect(row?.current?.method).toBe("electronic");
    expect(row?.earlier.map((item) => item.decision)).toContain("granted");
    expect(
      (await office.people.student({ id: child.studentId })).noPhotos,
    ).toBe(true);
    await family.consents.answer({
      studentId: child.studentId,
      noticeId: website.id,
      agreed: true,
    });
    expect(
      (await office.people.student({ id: child.studentId })).noPhotos,
    ).toBe(false);
  });

  test("a guardian whose rights a court restricted follows the child but does not decide", async () => {
    const family = await mother();
    const { data, child } = await firstChild(family);
    const office = await principal();
    const form = data.forms[0];
    if (!form) throw new Error("no published form");
    await setRights(office, child.studentId, "restricted");
    try {
      const after = await family.consents.family();
      expect(
        after.children.find((row) => row.studentId === child.studentId)
          ?.mayAnswer,
      ).toBe(false);
      expect(
        await rejection(
          family.consents.answer({
            studentId: child.studentId,
            noticeId: form.id,
            agreed: true,
          }),
        ),
      ).toMatchObject({ code: "FORBIDDEN" });
      const reports = await family.absenceReports.mine({
        studentId: child.studentId,
      });
      expect(reports.mayReport).toBe(false);
      expect(
        await rejection(
          family.absenceReports.report({
            studentId: child.studentId,
            kind: "absent",
            from: reports.today,
            to: reports.today,
            at: "",
            reasonId: reports.reasons[0]?.id ?? "",
            note: "",
            fileId: "",
          }),
        ),
      ).toMatchObject({ code: "FORBIDDEN" });
    } finally {
      await setRights(office, child.studentId, "full");
    }
  });

  test("the office records a spoken answer, but a paper one needs its scan", async () => {
    const office = await principal();
    const family = await mother();
    const { child } = await firstChild(family);
    const news = await purpose(office, "photo_school_news");
    const record = await office.consents.student({ id: child.studentId });
    const guardian = record.answerers[0];
    if (!guardian) throw new Error("the child has no answering guardian");
    const answer = {
      studentId: child.studentId,
      purposeId: news.id,
      relationshipId: guardian.relationshipId,
      agreed: true,
      method: "verbal_recorded" as const,
      givenOn: record.today,
      fileId: "",
      note: "Said yes at parents' evening.",
    };
    expect(
      await rejection(
        office.consents.record({ ...answer, method: "paper_scanned" }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
    const saved = await office.consents.record(answer);
    expect(saved.decision).toBe("granted");
    const after = await office.consents.student({ id: child.studentId });
    const row = after.purposes.find((item) => item.id === news.id);
    expect(row?.current).toMatchObject({
      decision: "granted",
      method: "verbal_recorded",
      note: "Said yes at parents' evening.",
    });
    expect(row?.current?.recordedBy).not.toBeNull();
  });

  test("a new version asks again while the earlier answer stays in force", async () => {
    const office = await principal();
    const family = await mother();
    const { child } = await firstChild(family);
    const news = await purpose(office, "photo_school_news");
    const draft = await office.consents.saveForm({
      id: "",
      expectedVersion: 0,
      purposeId: news.id,
      primaryLocale: "en",
      body: plainContent("May photos of your child appear in school news?"),
      translation: plainContent("هل تظهر صور طفلك في أخبار المدرسة؟"),
    });
    const published = await office.consents.publishForm({
      id: draft.id,
      expectedVersion: draft.version,
    });
    expect(published.asked).toBeGreaterThan(0);
    const data = await family.consents.family();
    const form = data.forms.find((row) => row.purposeId === news.id);
    expect(form?.id).toBe(draft.id);
    expect(form?.versionLabel).toBe("2");
    const answer = data.children
      .find((row) => row.studentId === child.studentId)
      ?.answers.find((row) => row.purposeId === news.id);
    expect(answer?.decision).toBe("granted");
    expect(answer?.formId).not.toBe(draft.id);
    const { rows } = await family.notifications.list({ tab: "action" });
    expect(rows.some((row) => row.subjectId === draft.id)).toBe(true);
    for (const row of data.children.filter((item) => item.mayAnswer))
      await family.consents.answer({
        studentId: row.studentId,
        noticeId: draft.id,
        agreed: true,
      });
    const after = await family.notifications.list({ tab: "action" });
    expect(after.rows.some((row) => row.subjectId === draft.id)).toBe(false);
  });
  test("a form's translation is checked only once it is written, and the check is recorded", async () => {
    const office = await principal();
    const processing = await purpose(office, "admission_processing");
    const draft = await office.consents.saveForm({
      id: "",
      expectedVersion: 0,
      purposeId: processing.id,
      primaryLocale: "en",
      body: plainContent(
        "We use what you send us to decide on the application.",
      ),
      translation: null,
    });
    expect(
      await rejection(
        office.consents.reviewForm({
          id: draft.id,
          expectedVersion: draft.version,
          reviewed: true,
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "consents.nothing_to_check" });
    const translated = await office.consents.saveForm({
      id: draft.id,
      expectedVersion: draft.version,
      purposeId: processing.id,
      primaryLocale: "en",
      body: plainContent(
        "We use what you send us to decide on the application.",
      ),
      translation: plainContent("نستخدم ما ترسلونه للبتّ في الطلب."),
    });
    const checked = await office.consents.reviewForm({
      id: draft.id,
      expectedVersion: translated.version,
      reviewed: true,
    });
    expect(checked.review?.current).toBe(true);
    await office.consents.discardForm({
      id: draft.id,
      expectedVersion: checked.version,
    });
  });
});

/** A picture the office uploads for news: a PNG signature is all the check reads. */
async function picture() {
  const office = await sessionFor("northwind", login("principal"));
  const png = new Blob([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]),
  ]);
  const file = await office.api.files.initiate({
    purpose: "document_media",
    name: "sports-day.png",
    mediaType: "image/png",
    sizeBytes: png.size,
  });
  await raw("northwind", office.token, `/v1/files/${file.id}/content`, {
    method: "PUT",
    body: png,
  });
  return file.id;
}

async function answerFor(family: Family, code: string, agreed: boolean) {
  const { data, child } = await firstChild(family);
  const office = await principal();
  const purposeId = (await purpose(office, code)).id;
  const form = data.forms.find((row) => row.purposeId === purposeId);
  if (!form) throw new Error(`no published ${code} form`);
  await family.consents.answer({
    studentId: child.studentId,
    noticeId: form.id,
    agreed,
  });
  return child.studentId;
}

function withPicture(body: ContentDocument, fileId: string): ContentDocument {
  return {
    root: {
      ...body.root,
      children: [
        {
          type: "image",
          version: 1,
          fileId,
          alt: "Children on the field",
          caption: "",
          size: "full",
        },
        ...(body.root.children ?? []),
      ],
    },
  };
}

/** A post opening with a picture in its words, and no cover. */
const post = (
  title: string,
  pictureId: string,
  visibility: "public" | "school",
) => ({
  id: "",
  expectedVersion: 0,
  visibility,
  primaryLocale: "en" as const,
  titleEn: title,
  titleAr: "",
  excerptEn: "",
  excerptAr: "",
  slug: `${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-${crypto.randomUUID().slice(0, 6)}`,
  categoryId: "",
  coverFileId: "",
  coverAltEn: "",
  coverAltAr: "",
  pinned: false,
  audiences:
    visibility === "school"
      ? [{ scope: "families" as const, classId: "", gradeId: "" }]
      : [],
  body: withPicture(plainContent(`${title} was a great day.`), pictureId),
  translation: null,
});

describe("pictures of students", () => {
  test("a website post waits for every pictured student's family, and a later no takes the picture down", async () => {
    const family = await mother();
    const studentId = await answerFor(family, "photo_school_website", false);
    const office = await principal();
    const fileId = await picture();
    // Its own title, apart from the seeded draft the website test keeps hidden.
    const draft = post("Field day", fileId, "public");
    const saved = await office.broadcasts.news.save(draft);
    await office.files.tagPictured({ id: fileId, studentIds: [studentId] });
    const { files } = await office.files.pictured({ ids: [fileId] });
    expect(files[0]?.people.map((row) => [row.id, row.website])).toEqual([
      [studentId, "refused"],
    ]);
    expect(
      await rejection(
        office.broadcasts.news.publish({
          id: saved.id,
          expectedVersion: saved.version,
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "site.consent" });

    await answerFor(family, "photo_school_website", true);
    await office.broadcasts.news.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const read = await client("northwind").site.publicSitePost({
      school: "northwind",
      locale: "en",
      slug: draft.slug,
    });
    expect(read.title).toBe("Field day");
    expect(read.coverKey).not.toBeNull();
    expect(read.coverAlt).toBe("Children on the field");

    await answerFor(family, "photo_school_website", false);
    const { rows: history } = await office.people.studentHistory({
      id: studentId,
    });
    expect(history.map((entry) => entry.action)).toContain("file.unpublish");
  });

  test("school news checks the answer for photos in school news", async () => {
    const family = await mother();
    const studentId = await answerFor(family, "photo_school_news", false);
    const office = await principal();
    const fileId = await picture();
    const saved = await office.broadcasts.news.save(
      post("Class assembly", fileId, "school"),
    );
    await office.files.tagPictured({ id: fileId, studentIds: [studentId] });
    expect(
      await rejection(
        office.broadcasts.news.publish({
          id: saved.id,
          expectedVersion: saved.version,
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "news.consent" });
    await answerFor(family, "photo_school_news", true);
    await office.broadcasts.news.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
  });

  test("only those who publish pictures name who is in them", async () => {
    const fileId = await picture();
    const teacher = await signedIn("northwind", login("teacher"));
    expect(
      await rejection(
        teacher.files.tagPictured({ id: fileId, studentIds: [] }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});
