import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";

import {
  createFilesHost,
  LINK_SECONDS,
  linkKey,
  linkSeconds,
  MEDIA_LINK_SECONDS,
  openLink,
  sealLink,
} from "../src/files/links";
import { FILES_ORIGIN, raw, seeded, sessionFor, login } from "./harness";

const key = linkKey(new Uint8Array(randomBytes(32)));
const grant = {
  storageKey:
    "t/0190a1b2-0000-7000-8000-000000000001/f/0190a1b2-0000-7000-8000-0000000000aa",
  name: "Salama's health report.pdf",
  mediaType: "application/pdf",
  sizeBytes: 10,
  disposition: "inline" as const,
  expires: 1_000,
};

describe("sealed links", () => {
  test("open to the grant they were sealed with until they expire", () => {
    const token = sealLink(key, grant);
    expect(openLink(key, token, 999)).toEqual(grant);
    expect(openLink(key, token, 1_000)).toEqual(grant);
    expect(openLink(key, token, 1_001)).toBeNull();
  });

  test("hide the file's name and refuse any change or other key", () => {
    const token = sealLink(key, grant);
    expect(Buffer.from(token, "base64url").toString()).not.toContain("health");
    const bytes = Buffer.from(token, "base64url");
    bytes[20] = (bytes[20] ?? 0) ^ 1;
    expect(openLink(key, bytes.toString("base64url"), 0)).toBeNull();
    expect(
      openLink(linkKey(new Uint8Array(randomBytes(32))), token, 0),
    ).toBeNull();
    expect(openLink(key, "not-a-link", 0)).toBeNull();
  });

  test("last longer for recordings, which a player reads as it plays", () => {
    expect(linkSeconds("video/mp4")).toBe(MEDIA_LINK_SECONDS);
    expect(linkSeconds("audio/mpeg")).toBe(MEDIA_LINK_SECONDS);
    expect(linkSeconds("image/png")).toBe(LINK_SECONDS);
    expect(linkSeconds("application/pdf")).toBe(LINK_SECONDS);
  });
});

async function uploaded(
  token: string,
  name: string,
  mediaType: string,
  body: string,
) {
  const { api } = await sessionFor("northwind", login("teacher"));
  const file = await api.files.initiate({
    purpose: "attachment",
    name,
    mediaType,
    sizeBytes: new Blob([body]).size,
  });
  const put = await raw("northwind", token, `/v1/files/${file.id}/content`, {
    method: "PUT",
    body,
    headers: { "content-type": mediaType },
  });
  expect(put.status).toBe(200);
  return file.id;
}

describe("downloads", () => {
  test("go to a short-lived link on the files host, never to the bytes", async () => {
    const { token } = await sessionFor("northwind", login("teacher"));
    const id = await uploaded(
      token,
      "notes.txt",
      "text/plain",
      "photosynthesis",
    );
    const response = await raw("northwind", token, `/v1/files/${id}/content`, {
      redirect: "manual",
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const location = response.headers.get("location") ?? "";
    expect(location).toStartWith(`${FILES_ORIGIN}/b/`);
    expect(location).not.toContain("notes");
    expect(await response.text()).toBe("");
  });

  test("are served sandboxed and open to any page, with ranges", async () => {
    const { token } = await sessionFor("northwind", login("teacher"));
    const id = await uploaded(
      token,
      "notes.txt",
      "text/plain",
      "photosynthesis",
    );
    const whole = await raw("northwind", token, `/v1/files/${id}/content`);
    expect(whole.status).toBe(200);
    expect(await whole.text()).toBe("photosynthesis");
    expect(whole.headers.get("access-control-allow-origin")).toBe("*");
    expect(whole.headers.get("content-security-policy")).toStartWith("sandbox");
    expect(whole.headers.get("set-cookie")).toBeNull();
    const part = await raw("northwind", token, `/v1/files/${id}/content`, {
      headers: { range: "bytes=5-8" },
    });
    expect(part.status).toBe(206);
    expect(await part.text()).toBe("synt");
    const saved = await raw("northwind", token, `/v1/files/${id}/content?download`);
    expect(saved.headers.get("content-disposition")).toStartWith("attachment;");
  });

  test("leave a PDF unsandboxed so the browser can draw it", async () => {
    const { token } = await sessionFor("northwind", login("teacher"));
    const id = await uploaded(
      token,
      "worksheet.pdf",
      "application/pdf",
      "%PDF-1.4\n%%EOF\n",
    );
    const response = await raw("northwind", token, `/v1/files/${id}/content`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(response.headers.get("content-disposition")).toStartWith("inline;");
  });

  test("refuse a link once it has expired", async () => {
    const { token } = await sessionFor("northwind", login("teacher"));
    const id = await uploaded(
      token,
      "notes.txt",
      "text/plain",
      "photosynthesis",
    );
    const location =
      (
        await raw("northwind", token, `/v1/files/${id}/content`, {
          redirect: "manual",
        })
      ).headers.get("location") ?? "";
    const later = createFilesHost({
      files: seeded().files,
      key: linkKey(seeded().cellSecret),
      now: () => Math.floor(Date.now() / 1000) + LINK_SECONDS + 1,
    });
    expect((await later(new Request(location))).status).toBe(404);
    expect((await seeded().filesHost(new Request(location))).status).toBe(200);
    expect(
      (await seeded().filesHost(new Request(location, { method: "POST" })))
        .status,
    ).toBe(405);
  });
});

describe("the play page", () => {
  test("holds students' web pages in a sandbox that reaches no network", async () => {
    const host = seeded().filesHost;
    const page = await host(new Request(`${FILES_ORIGIN}/play`));
    expect(page.status).toBe(200);
    expect(page.headers.get("set-cookie")).toBeNull();
    const policy = page.headers.get("content-security-policy") ?? "";
    expect(policy).toContain("connect-src 'none'");
    expect(policy).toContain("form-action 'none'");
    const html = await page.text();
    expect(html).toContain('sandbox="allow-scripts allow-modals allow-forms"');
    expect(html).not.toContain("allow-same-origin");
    const script = await host(new Request(`${FILES_ORIGIN}/play/shell.js`));
    expect(script.headers.get("content-type")).toContain("javascript");
  });
});
