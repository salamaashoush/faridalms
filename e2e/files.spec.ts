import type { APIRequestContext } from "@playwright/test";

import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

const api = "http://127.0.0.1:3001";
const origin = `${api}/v1`;

async function signIn(request: APIRequestContext, email: string) {
  const response = await request.post(`${origin}/auth/signIn`, {
    data: { school: "northwind", email, password: "northwind1234" },
  });
  expect(response.status()).toBe(200);
  const session = (await response.json()) as { token: string };
  return { authorization: `Bearer ${session.token}` };
}

async function initiate(
  request: APIRequestContext,
  headers: Record<string, string>,
  purpose: string,
  name: string,
  mediaType: string,
  body: Buffer,
) {
  const initiated = await request.post(`${origin}/initiateUpload`, {
    headers,
    data: { purpose, name, mediaType, sizeBytes: body.byteLength },
  });
  expect(initiated.status()).toBe(200);
  return (await initiated.json()) as { id: string; uploadPath: string };
}

async function upload(
  request: APIRequestContext,
  headers: Record<string, string>,
  purpose: string,
  name: string,
  mediaType: string,
  body: Buffer,
) {
  const { id, uploadPath } = await initiate(
    request,
    headers,
    purpose,
    name,
    mediaType,
    body,
  );
  const stored = await request.put(`${api}${uploadPath}`, {
    headers: { ...headers, "content-type": mediaType },
    data: body,
  });
  return {
    id,
    status: stored.status(),
    code: stored.ok() ? null : ((await stored.json()) as { code: string }).code,
  };
}

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d,
]);

test("uploads whose bytes do not match their type are refused and never served", async ({
  request,
}) => {
  const sara = await signIn(request, "sara@example.com");
  const renamed = await upload(
    request,
    sara,
    "message_attachment",
    "worksheet.pdf",
    "application/pdf",
    Buffer.concat([Buffer.from("MZ"), Buffer.from([0x90, 0, 3, 0])]),
  );
  expect(renamed).toMatchObject({ status: 422, code: "file.content_mismatch" });
  expect(
    (
      await request.get(`${api}/v1/files/${renamed.id}/content`, {
        headers: sara,
      })
    ).status(),
  ).toBe(404);
  expect(
    await upload(
      request,
      sara,
      "message_attachment",
      "notes.txt",
      "text/plain",
      Buffer.from([0x61, 0, 0x62]),
    ),
  ).toMatchObject({ status: 422, code: "file.content_mismatch" });
  expect(
    await upload(
      request,
      sara,
      "lesson_media",
      "captions.vtt",
      "text/vtt",
      Buffer.from("1\n00:00:00,000 --> 00:00:01,000\nHello"),
    ),
  ).toMatchObject({ status: 422, code: "file.content_mismatch" });

  const captions = await upload(
    request,
    sara,
    "lesson_media",
    "captions.vtt",
    "text/vtt",
    Buffer.from("WEBVTT\n\n00:00.000 --> 00:01.000\nمرحبا"),
  );
  expect(captions).toMatchObject({ status: 200, code: null });
  const picture = await upload(
    request,
    sara,
    "message_attachment",
    "photo.png",
    "image/png",
    PNG,
  );
  expect(picture).toMatchObject({ status: 200, code: null });
  const download = await request.get(`${api}/v1/files/${picture.id}/content`, {
    headers: sara,
  });
  expect(download.status()).toBe(200);
  expect(Buffer.from(await download.body()).equals(PNG)).toBe(true);
});

test("the sweep rejects abandoned uploads, drops unlinked files and keeps anything a record or page refers to", async ({
  request,
}) => {
  const admin = await signIn(request, "admin@example.com");
  const sara = await signIn(request, "sara@example.com");
  const abandoned = await initiate(
    request,
    admin,
    "site_media",
    "hero.png",
    "image/png",
    PNG,
  );
  const orphan = await upload(
    request,
    admin,
    "site_media",
    "orphan.png",
    "image/png",
    PNG,
  );
  const pictured = await upload(
    request,
    admin,
    "site_media",
    "pictured.png",
    "image/png",
    PNG,
  );
  expect([orphan.status, pictured.status]).toEqual([200, 200]);
  const page = await request.post(`${origin}/saveSitePage`, {
    headers: admin,
    data: {
      id: crypto.randomUUID(),
      expectedRevision: 0,
      slug: `gallery-${crypto.randomUUID().slice(0, 8)}`,
      locale: "en",
      title: "Salama gallery",
      summary: "",
      navGroup: "",
      navOrder: 0,
      showInNav: false,
      document: {
        version: 1,
        locale: "en",
        sections: [
          {
            id: crypto.randomUUID(),
            tone: "plain",
            columns: [
              {
                id: crypto.randomUUID(),
                blocks: [
                  {
                    id: crypto.randomUUID(),
                    type: "image",
                    assetId: pictured.id,
                    alt: "The school garden",
                    caption: "",
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  });
  expect(page.status()).toBe(200);

  const profile = await request.post(`${origin}/auth/currentUser`, {
    headers: await signIn(request, "parent@example.com"),
  });
  const parentId = ((await profile.json()) as { id: string }).id;
  const linked = await upload(
    request,
    sara,
    "message_attachment",
    "plan.pdf",
    "application/pdf",
    Buffer.from("%PDF-1.4 plan"),
  );
  expect(linked.status).toBe(200);
  const draft = await request.post(`${origin}/saveMessageDraft`, {
    headers: sara,
    data: {
      id: crypto.randomUUID(),
      expectedRevision: 0,
      category: "parents",
      recipientId: parentId,
      subject: "Salama sweep draft",
      body: "Plan attached.",
      bodyFormat: "plain",
      fileIds: [linked.id],
    },
  });
  expect(draft.status()).toBe(200);

  const result = JSON.parse(
    execFileSync(
      "bun",
      [
        "e2e/fixtures/file-sweep.ts",
        JSON.stringify({
          abandoned: abandoned.id,
          orphan: orphan.id,
          linked: linked.id,
          document: pictured.id,
        }),
      ],
      { encoding: "utf8" },
    ),
  ) as {
    abandonedFound: boolean;
    abandonedState: { state: string; rejectionReason: string | null };
    candidates: Record<"orphan" | "linked" | "document", boolean>;
    referenced: string[];
    orphanRemoved: boolean;
    documentRemoved: boolean;
    linkedKept: boolean;
  };
  expect(result.abandonedFound).toBe(true);
  expect(result.abandonedState).toEqual({
    state: "rejected",
    rejectionReason: "abandoned",
  });
  expect(result.candidates).toEqual({
    orphan: true,
    linked: false,
    document: true,
  });
  expect(result.referenced).toEqual([linked.id, pictured.id].toSorted());
  expect(result.orphanRemoved).toBe(true);
  expect(result.documentRemoved).toBe(false);
  expect(result.linkedKept).toBe(true);

  const read = (id: string, headers: Record<string, string>) =>
    request.get(`${api}/v1/files/${id}/content`, { headers });
  expect((await read(orphan.id, admin)).status()).toBe(404);
  expect((await read(pictured.id, admin)).status()).toBe(200);
  expect((await read(linked.id, sara)).status()).toBe(200);
  expect(
    (
      await request.put(`${api}${abandoned.uploadPath}`, {
        headers: { ...admin, "content-type": "image/png" },
        data: PNG,
      })
    ).status(),
  ).toBe(404);
});
