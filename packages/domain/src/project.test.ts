import * as v from "valibot";
import { describe, expect, it } from "vitest";

import {
  emptyProject,
  entryOf,
  fileKind,
  fileNamed,
  fileNameIssue,
  MAX_PROJECT_BYTES,
  MAX_PROJECT_FILES,
  projectFilesSchema,
  sameFiles,
  starterFilesSchema,
} from "./project";

const page = { name: "index.html", code: "<h1>Hi</h1>" };

describe("project files", () => {
  it("takes plain names of the kinds a page is made of", () => {
    expect(fileKind("index.html")).toBe("html");
    expect(fileKind("my-style_2.css")).toBe("css");
    expect(fileKind("game.js")).toBe("js");
    expect(fileKind("star.svg")).toBe("svg");
    expect(fileKind("notes.txt")).toBeNull();
    expect(fileKind("../index.html")).toBeNull();
    expect(fileKind("a b.html")).toBeNull();
    expect(fileKind(".html")).toBeNull();
    expect(fileKind("صفحة.html")).toBeNull();
  });

  it("refuses a name another file has, whatever the case", () => {
    expect(fileNameIssue("About.html", ["index.html"])).toBeNull();
    expect(fileNameIssue("INDEX.html", ["index.html"])).toBe(
      "learning.project_file_taken",
    );
    expect(fileNameIssue("about", ["index.html"])).toBe(
      "learning.project_file",
    );
  });

  it("opens on index.html, or else the first page", () => {
    expect(entryOf([{ name: "a.css", code: "" }, page])).toBe("index.html");
    expect(
      entryOf([
        { name: "home.html", code: "" },
        { name: "about.html", code: "" },
      ]),
    ).toBe("home.html");
    expect(entryOf([{ name: "a.css", code: "" }])).toBeNull();
  });

  it("finds the file a link names", () => {
    const files = [page, { name: "About.html", code: "" }];
    expect(fileNamed(files, "./about.html#top")?.name).toBe("About.html");
    expect(fileNamed(files, "about.html?x=1")?.name).toBe("About.html");
    expect(fileNamed(files, "pages/about.html")).toBeNull();
    expect(fileNamed(files, "https://example.com/index.html")).toBeNull();
  });

  it("needs a page in a project handed in, but not in a starter", () => {
    const styles = [{ name: "style.css", code: "h1{}" }];
    expect(v.safeParse(projectFilesSchema, styles).success).toBe(false);
    expect(v.safeParse(projectFilesSchema, []).success).toBe(false);
    expect(v.safeParse(starterFilesSchema, styles).success).toBe(true);
    expect(v.safeParse(starterFilesSchema, []).success).toBe(true);
    expect(v.safeParse(projectFilesSchema, [page]).success).toBe(true);
  });

  it("refuses two files of one name, too many files and too much code", () => {
    expect(
      v.safeParse(projectFilesSchema, [page, { ...page, name: "Index.html" }])
        .success,
    ).toBe(false);
    const many = Array.from({ length: MAX_PROJECT_FILES + 1 }, (_, at) => ({
      name: `p${at}.html`,
      code: "",
    }));
    expect(v.safeParse(projectFilesSchema, many).success).toBe(false);
    expect(
      v.safeParse(projectFilesSchema, many.slice(0, MAX_PROJECT_FILES)).success,
    ).toBe(true);
    // Arabic letters weigh two bytes each as stored.
    const heavy = [{ ...page, code: "ب".repeat(MAX_PROJECT_BYTES / 2) }];
    expect(v.safeParse(projectFilesSchema, heavy).success).toBe(false);
    const fits = [{ ...page, code: "ب".repeat(MAX_PROJECT_BYTES / 2 - 100) }];
    expect(v.safeParse(projectFilesSchema, fits).success).toBe(true);
  });

  it("starts an empty project as a page a student can hand in", () => {
    const files = emptyProject("ar", true);
    expect(v.safeParse(projectFilesSchema, files).success).toBe(true);
    expect(files[0]?.code).toContain('<html lang="ar" dir="rtl">');
    expect(emptyProject("en", false)[0]?.code).toContain('<html lang="en">');
    expect(sameFiles(files, emptyProject("ar", true))).toBe(true);
    expect(sameFiles(files, emptyProject("en", false))).toBe(false);
  });
});
