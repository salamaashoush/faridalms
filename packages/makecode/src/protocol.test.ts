import { describe, expect, it } from "vitest";

import { blankProject } from "./project";
import { editorUrl, fromEditor, heard, saveNow, synced } from "./protocol";

describe("what the editor says", () => {
  it("is read by what it asks for", () => {
    expect(
      fromEditor({
        type: "pxthost",
        action: "workspacesync",
        id: "a1",
        response: true,
      }),
    ).toEqual({ kind: "sync", id: "a1" });
    expect(
      fromEditor({
        type: "pxthost",
        action: "workspacesave",
        project: { header: { name: "x" }, text: { "main.ts": "" } },
      }),
    ).toEqual({ kind: "save", text: { "main.ts": "" } });
    expect(
      fromEditor({
        type: "pxthost",
        action: "workspaceloaded",
        id: "d4",
        response: true,
      }),
    ).toEqual({ kind: "loaded", id: "d4" });
    expect(
      fromEditor({
        type: "farida-makecode",
        target: "microbit",
        version: "9.1.1",
      }),
    ).toEqual({ kind: "hello", version: "9.1.1" });
  });

  it("is told it was heard whenever it waits to be", () => {
    expect(
      fromEditor({
        type: "pxthost",
        action: "workspacereset",
        id: "b2",
        response: true,
      }),
    ).toEqual({ kind: "asked", id: "b2" });
    expect(heard("b2")).toEqual({ type: "pxthost", id: "b2", success: true });
    expect(
      fromEditor({ type: "pxthost", action: "workspaceevent", id: "c3" }),
    ).toBeNull();
  });

  it("hands over a compiled program by its shape alone", () => {
    expect(fromEditor({ name: "microbit-Untitled", download: ":00" })).toEqual({
      kind: "program",
      name: "microbit-Untitled",
      hex: ":00",
    });
    expect(fromEditor({ download: ":00" })).toMatchObject({ name: "microbit" });
  });

  it("says when it has done what it was asked", () => {
    expect(saveNow("s1")).toMatchObject({
      type: "pxteditor",
      action: "saveproject",
      id: "s1",
      response: true,
    });
    expect(fromEditor({ type: "pxteditor", id: "s1", success: true })).toEqual({
      kind: "done",
      id: "s1",
    });
    expect(
      fromEditor({ type: "pxteditor", action: "editorcontentloaded" }),
    ).toBeNull();
  });

  it("tells of its back arrow, which is the page's to act on", () => {
    expect(fromEditor({ cmd: "backtap" })).toEqual({ kind: "back" });
    expect(fromEditor({ cmd: "workspaceloaded" })).toBeNull();
  });

  it("means nothing when it is anything else", () => {
    for (const data of [
      null,
      "workspacesync",
      { type: "pxteditor", action: "workspacesync" },
      { type: "pxthost" },
      { type: "pxthost", action: "workspacesave" },
      { type: "farida-makecode", target: "arcade", version: "1" },
      { name: "x", save: ":00" },
      { type: "ready" },
    ])
      expect(fromEditor(data)).toBeNull();
  });
});

describe("what the editor is told", () => {
  it("is given the kept files as its one project, made in its own version", () => {
    const answer = synced("a1", blankProject(), {
      id: "p1",
      version: "9.1.1",
      now: 1_800_000_000,
    });
    expect(answer).toMatchObject({
      type: "pxthost",
      id: "a1",
      success: true,
      projects: [
        {
          header: {
            id: "p1",
            target: "microbit",
            targetVersion: "9.1.1",
            name: "Untitled",
            editor: "blocksprj",
            isDeleted: false,
          },
        },
      ],
    });
    expect(Object.keys(answer.projects[0]?.text ?? {})).toEqual([
      "pxt.json",
      "main.blocks",
      "main.ts",
      "README.md",
    ]);
  });

  it("names a project by what its files call it", () => {
    const files = [{ name: "pxt.json", code: '{"name":"Step counter"}' }];
    const header = synced(undefined, files, { id: "p", version: "9", now: 1 })
      .projects[0]?.header;
    expect(header?.name).toBe("Step counter");
  });

  it("opens in the lesson's language, kept from change where only read", () => {
    expect(
      editorUrl("https://files.school.test", {
        language: "ar",
        readOnly: false,
      }),
    ).toBe(
      "https://files.school.test/makecode/index.html?controller=2&lang=ar#editor",
    );
    expect(
      editorUrl("http://localhost:3103", { language: "en", readOnly: true }),
    ).toBe(
      "http://localhost:3103/makecode/index.html?controller=2&lang=en&readonly=1#editor",
    );
  });
});
