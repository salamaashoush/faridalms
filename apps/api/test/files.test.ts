import { describe, expect, test } from "bun:test";

import { sweepTenantFiles } from "../src/files/sweep";
import { login, raw, rejection, seeded, sessionFor } from "./harness";

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
