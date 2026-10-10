import { describe, expect, it } from "vitest";

import { linkedPage, projectPage } from "./project-page";

const page = [
  "<!doctype html>",
  "<html>",
  "<head>",
  '<link rel="stylesheet" href="style.css">',
  "</head>",
  "<body>",
  '<img src="star.svg" alt="">',
  '<a href="about.html">About</a>',
  '<script src="./script.js"></script>',
  "<script>",
  "oops()",
  "</script>",
  "</body>",
  "</html>",
].join("\n");

const files = [
  { name: "index.html", code: page },
  { name: "about.html", code: "<h1>About</h1>" },
  {
    name: "style.css",
    code: 'h1 {\n  color: red;\n  background: url("star.svg");\n}',
  },
  {
    name: "script.js",
    code: 'const a = 1;\nconst end = "</script>";\nboom();',
  },
  { name: "star.svg", code: '<svg xmlns="http://www.w3.org/2000/svg"/>' },
];

describe("projectPage", () => {
  it("puts linked styles and scripts in their tags' places", () => {
    const made = projectPage(files);
    expect(made?.entry).toBe("index.html");
    expect(made?.html).toContain("<style>h1 {");
    expect(made?.html).toContain("<script>const a = 1;");
    expect(made?.html).not.toContain('src="./script.js"');
    expect(made?.html).not.toContain('href="style.css"');
  });

  it("keeps a closing tag written in a script from ending it", () => {
    expect(projectPage(files)?.html).toContain('const end = "<\\/script>";');
  });

  it("shows the project's drawings with no server", () => {
    const html = projectPage(files)?.html ?? "";
    const drawing = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(files[4]?.code ?? "")}`;
    expect(html).toContain(`<img src="${drawing}" alt="">`);
    expect(html).toContain(`background: url("${drawing}");`);
  });

  it("finds the file and line a played line was written on", () => {
    const made = projectPage(files);
    const lines = (made?.html ?? "").split("\n");
    const at = (text: string) =>
      made?.sourceAt(lines.findIndex((line) => line.includes(text)) + 1);
    expect(at("color: red")).toEqual({ file: "style.css", line: 2 });
    expect(at("boom()")).toEqual({ file: "script.js", line: 3 });
    expect(at("const a = 1")).toEqual({ file: "script.js", line: 1 });
    expect(at("oops()")).toEqual({ file: "index.html", line: 11 });
    expect(at("<body>")).toEqual({ file: "index.html", line: 6 });
    expect(at("<!doctype")).toEqual({ file: "index.html", line: 1 });
  });

  it("plays another page when asked, and none for a project without one", () => {
    expect(projectPage(files, "ABOUT.html")?.entry).toBe("about.html");
    expect(projectPage(files, "gone.html")?.entry).toBe("index.html");
    expect(projectPage([{ name: "style.css", code: "" }])).toBeNull();
  });

  it("leaves a tag alone that names no file of the project", () => {
    const made = projectPage([
      {
        name: "index.html",
        code: '<link rel="icon" href="style.css"><script src="other.js"></script>',
      },
      { name: "style.css", code: "p{}" },
    ]);
    expect(made?.html).toBe(
      '<link rel="icon" href="style.css"><script src="other.js"></script>',
    );
  });
});

describe("linkedPage", () => {
  it("follows a link only to a page of the project", () => {
    expect(linkedPage(files, "about.html#team")).toBe("about.html");
    expect(linkedPage(files, "./about.html?x=1")).toBe("about.html");
    expect(linkedPage(files, "style.css")).toBeNull();
    expect(linkedPage(files, "https://example.com/about.html")).toBeNull();
  });
});
