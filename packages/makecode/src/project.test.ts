import { describe, expect, it } from "vitest";

import {
  blankProject,
  editorOf,
  filesOf,
  isDeviceProject,
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
