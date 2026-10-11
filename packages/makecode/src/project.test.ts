import { describe, expect, it } from "vitest";

import {
  blankProject,
  editorOf,
  filesOf,
  isDeviceProject,
  locked,
  lockOf,
  programOf,
  textOf,
} from "./project";

describe("a device project's files", () => {
  it("keeps the files a student would name, and lets the editor's own go", () => {
    const files = filesOf({
      "README.md": "",
      "main.ts": "basic.showNumber(7)\n",
      _history: "every change ever made",
      ".simstate.json": "{}",
      "main.blocks": "<xml></xml>",
      "custom.ts": "// helpers",
      "pxt.json": "{}",
      "assets/sprite.png": "…",
      "notes.md": 7,
    });
    expect(files.map((file) => file.name)).toEqual([
      "pxt.json",
      "main.blocks",
      "main.ts",
      "README.md",
      "custom.ts",
    ]);
    expect(textOf(files)).toEqual({
      "pxt.json": "{}",
      "main.blocks": "<xml></xml>",
      "main.ts": "basic.showNumber(7)\n",
      "README.md": "",
      "custom.ts": "// helpers",
    });
  });

  it("comes to the same files whatever order the editor gives them in", () => {
    const text = textOf(blankProject());
    const turned = Object.fromEntries(Object.entries(text).toReversed());
    expect(filesOf(turned)).toEqual(filesOf(text));
    expect(filesOf(text)).toEqual(blankProject());
  });

  it("knows a device project by the file that says what it is", () => {
    expect(isDeviceProject(blankProject())).toBe(true);
    expect(isDeviceProject([{ name: "main.py", code: "" }])).toBe(false);
  });
});

const withConfig = (config: string) => [
  { name: "pxt.json", code: config },
  { name: "main.ts", code: "let a = 1\n" },
  { name: "main.py", code: "a = 1\n" },
];

describe("the editor a project opens in", () => {
  it("is the one the project was last worked in, and blocks otherwise", () => {
    expect(editorOf(blankProject())).toBe("blocksprj");
    expect(editorOf(withConfig('{"preferredEditor":"pyprj"}'))).toBe("pyprj");
    expect(editorOf(withConfig('{"preferredEditor":"tsprj"}'))).toBe("tsprj");
    expect(editorOf(withConfig('{"preferredEditor":"wordprj"}'))).toBe(
      "blocksprj",
    );
    expect(editorOf(withConfig("not json"))).toBe("blocksprj");
    expect(editorOf(withConfig("[]"))).toBe("blocksprj");
  });

  it("reads the program in the language it is written in", () => {
    expect(programOf(withConfig('{"preferredEditor":"pyprj"}'))?.name).toBe(
      "main.py",
    );
    expect(programOf(withConfig("{}"))?.name).toBe("main.ts");
    expect(programOf([{ name: "pxt.json", code: "{}" }])).toBeNull();
  });
});

const names = (files: { name: string }[]) => files.map((file) => file.name);
/** What a project says of itself, which its first file holds. */
const config = (files: { name: string; code: string }[]) =>
  JSON.parse(files[0]?.code ?? "{}") as Record<string, unknown>;

describe("a project held to one language", () => {
  it("is free to move between them until it is held", () => {
    expect(lockOf(blankProject())).toBeNull();
    expect(lockOf([{ name: "index.html", code: "" }])).toBeNull();
  });

  it("keeps its blocks and opens in them when held to blocks", () => {
    const held = locked(blankProject(), "blocks-only");
    expect(lockOf(held)).toBe("blocks-only");
    expect(editorOf(held)).toBe("blocksprj");
    expect(names(held)).toEqual(names(blankProject()));
    expect(config(held)).toMatchObject({
      name: "Untitled",
      dependencies: { core: "*", radio: "*", microphone: "*" },
      files: ["main.blocks", "main.ts", "README.md"],
    });
  });

  it("loses its blocks when held to JavaScript, as the editor's own such project has none", () => {
    const held = locked(blankProject(), "javascript-only");
    expect(lockOf(held)).toBe("javascript-only");
    expect(editorOf(held)).toBe("tsprj");
    expect(names(held)).toEqual(["pxt.json", "main.ts", "README.md"]);
    expect(config(held).files).toEqual(["main.ts", "README.md"]);
  });

  it("gains a Python file, empty until the editor fills it, when held to Python", () => {
    const held = locked(blankProject(), "python-only");
    expect(editorOf(held)).toBe("pyprj");
    expect(names(held)).toEqual([
      "pxt.json",
      "main.ts",
      "main.py",
      "README.md",
    ]);
    expect(config(held).files).toEqual(["main.ts", "README.md", "main.py"]);
    expect(programOf(held)?.name).toBe("main.py");
  });

  it("is freed without taking back the files it lost", () => {
    const freed = locked(locked(blankProject(), "javascript-only"), null);
    expect(lockOf(freed)).toBeNull();
    expect(config(freed)).not.toHaveProperty("languageRestriction");
    expect(names(freed)).toEqual(["pxt.json", "main.ts", "README.md"]);
  });

  it("puts blocks back, empty for the editor to draw from the program, when held to them again", () => {
    const held = locked(
      locked(blankProject(), "javascript-only"),
      "blocks-only",
    );
    expect(names(held)).toEqual([
      "pxt.json",
      "main.blocks",
      "main.ts",
      "README.md",
    ]);
    expect(held.find((file) => file.name === "main.blocks")?.code).toBe("");
  });

  it("leaves files that are no device project as they were", () => {
    const page = [{ name: "index.html", code: "<h1>Hi</h1>" }];
    expect(locked(page, "python-only")).toEqual(page);
  });
});
