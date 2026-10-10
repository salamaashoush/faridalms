import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createFilesHost,
  LINK_SECONDS,
  linkKey,
  linkSeconds,
  MEDIA_LINK_SECONDS,
  openLink,
  sealLink,
} from "../src/files/links";
import { createStudio } from "../src/files/studio";
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

  test("serves the drawing library a page may load, with its licence, to a page of no origin", async () => {
    const host = seeded().filesHost;
    const page = await host(new Request(`${FILES_ORIGIN}/play`));
    // The host is named, for the browser that takes 'self' to mean nothing here.
    expect(page.headers.get("content-security-policy")).toContain(
      `script-src 'self' ${FILES_ORIGIN} `,
    );
    const library = await host(
      new Request(`${FILES_ORIGIN}/play/lib/p5.min.js`),
    );
    expect(library.status).toBe(200);
    expect(library.headers.get("content-type")).toContain("javascript");
    expect(library.headers.get("access-control-allow-origin")).toBe("*");
    expect(library.headers.get("set-cookie")).toBeNull();
    expect((await library.text()).startsWith("var p5=")).toBe(true);
    const licence = await host(
      new Request(`${FILES_ORIGIN}/play/lib/p5.LICENSE.txt`),
    );
    expect(await licence.text()).toContain("GNU LESSER GENERAL PUBLIC LICENSE");
    expect(
      (await host(new Request(`${FILES_ORIGIN}/play/lib/other.js`))).status,
    ).toBe(404);
  });
});

describe("the coding studio", () => {
  const SPRITE = "0123456789abcdef0123456789abcdef.svg";
  const CHUNK = "chunks/540.dc378b43d371f4abea35.js";

  async function studioHost() {
    const scratch = await mkdtemp(join(tmpdir(), "scratch-"));
    await mkdir(join(scratch, "editor", "chunks"), { recursive: true });
    await mkdir(join(scratch, "library"));
    await writeFile(
      join(scratch, "editor", "scratch-gui-standalone.js"),
      "window.GUI = {};",
    );
    await writeFile(join(scratch, "editor", CHUNK), "");
    await writeFile(join(scratch, "library", SPRITE), "<svg/>");
    await writeFile(join(scratch, "secret.txt"), "not the studio's");
    const host = createFilesHost({
      files: seeded().files,
      key,
      studio: createStudio({
        page: fileURLToPath(new URL("../studio", import.meta.url)),
        scratch,
        sourceUrl: "https://example.com/farida",
      }),
    });
    return (path: string, headers?: Record<string, string>) =>
      host(new Request(`${FILES_ORIGIN}${path}`, { headers }));
  }

  test("reaches only the files host and sets no cookie", async () => {
    const get = await studioHost();
    const page = await get("/studio/?parent=https%3A%2F%2Fschool.test");
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(page.headers.get("set-cookie")).toBeNull();
    const policy = page.headers.get("content-security-policy") ?? "";
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("connect-src 'self' data: blob:");
    expect(policy).toContain("form-action 'none'");
    expect(await page.text()).toContain("scratch-gui-standalone.js");
    const script = await get("/studio/host.js");
    expect(script.headers.get("content-type")).toContain("javascript");
    expect(script.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("lets no script on the host become a service worker", async () => {
    const get = await studioHost();
    const asked = { "service-worker": "script" };
    expect((await get("/studio/host.js", asked)).status).toBe(404);
    expect((await get(`/${CHUNK}`, asked)).status).toBe(404);
    expect((await get("/play/shell.js", asked)).status).toBe(404);
    expect((await get("/studio/host.js")).status).toBe(200);
  });

  test("keeps what is named by its contents and asks again for the rest", async () => {
    const get = await studioHost();
    // The editor asks for its late code at the root of the host too.
    for (const path of [
      `/studio/library/${SPRITE}`,
      `/studio/${CHUNK}`,
      `/${CHUNK}`,
    ]) {
      const kept = await get(path);
      expect(kept.status).toBe(200);
      expect(kept.headers.get("cache-control")).toContain("immutable");
    }
    const bundle = await get("/studio/scratch-gui-standalone.js");
    expect(bundle.headers.get("cache-control")).toBe("no-cache");
    const etag = bundle.headers.get("etag") ?? "";
    expect(etag).not.toBe("");
    const again = await get("/studio/scratch-gui-standalone.js", {
      "if-none-match": etag,
    });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
  });

  test("serves nothing from outside the studio", async () => {
    const get = await studioHost();
    for (const path of [
      "/studio/..%2Fsecret.txt",
      "/studio/%2E%2E/secret.txt",
      "/studio/library/..%2F..%2Fsecret.txt",
      "/studio/library/not-a-hash.svg",
      "/studio/chunks",
      "/studio/missing.js",
      "/chunks/..%2F..%2Fsecret.txt",
      "/static/missing.png",
      "/scratch-gui-standalone.js",
      "/studio/%E0%A4%A",
    ])
      expect((await get(path)).status).toBe(404);
  });

  test("says where its source is published", async () => {
    const get = await studioHost();
    const source = await get("/studio/SOURCE");
    expect(source.headers.get("content-type")).toContain("text/plain");
    const text = await source.text();
    expect(text).toContain("https://www.gnu.org/licenses/agpl-3.0.html");
    expect(text).toContain("Source: https://example.com/farida");
  });
});
