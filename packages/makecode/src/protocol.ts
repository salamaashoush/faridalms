import * as v from "valibot";

import type { CodeFile } from "./project";

import { CONFIG, editorOf, textOf } from "./project";

/** The device a project is for, as the editor names it. */
export const TARGET = "microbit";

/**
 * What the editor's page says of itself before the editor loads: which
 * editor it is, and its version, which a project handed to it is marked
 * with so that none of the editor's repairs for older projects run on it.
 */
const helloSchema = v.object({
  type: v.literal("farida-makecode"),
  target: v.string(),
  version: v.pipe(v.string(), v.maxLength(40)),
});

/** The editor asking the page around it for something, or telling it. */
const hostSchema = v.object({
  type: v.literal("pxthost"),
  action: v.string(),
  id: v.optional(v.string()),
  response: v.optional(v.boolean()),
  project: v.optional(
    v.object({ text: v.optional(v.record(v.string(), v.unknown())) }),
  ),
});

/** The editor saying it has done something it was asked to. */
const doneSchema = v.object({
  type: v.literal("pxteditor"),
  id: v.string(),
  success: v.boolean(),
});

/**
 * A compiled program, handed over rather than downloaded when the editor
 * is told the page around it is its host. It carries no word saying what
 * it is; its shape is all there is to know it by.
 */
const programSchema = v.object({
  name: v.optional(v.string()),
  download: v.string(),
});

/** The editor's own way out, pressed: it is the page's to act on. */
const backSchema = v.object({ cmd: v.literal("backtap") });

export type FromEditor =
  | { kind: "hello"; version: string }
  /** The editor wants the project it is to open. */
  | { kind: "sync"; id: string | undefined }
  /** The project as it now stands. */
  | { kind: "save"; text: Record<string, unknown> }
  /** The project is open and can be worked on. */
  | { kind: "loaded"; id: string | undefined }
  | { kind: "program"; name: string; hex: string }
  /** Something the page asked of the editor is done. */
  | { kind: "done"; id: string }
  /** The editor's back arrow was pressed. */
  | { kind: "back" }
  /** Something else the editor waits to hear was received. */
  | { kind: "asked"; id: string };

/**
 * What a message from the editor's frame means, or null for one that
 * means nothing here. The editor says a good deal the page has no use for.
 */
export function fromEditor(data: unknown): FromEditor | null {
  const hello = v.safeParse(helloSchema, data);
  if (hello.success)
    return hello.output.target === TARGET
      ? { kind: "hello", version: hello.output.version }
      : null;
  const host = v.safeParse(hostSchema, data);
  if (host.success) {
    const { action, id, response, project } = host.output;
    if (action === "workspacesync") return { kind: "sync", id };
    if (action === "workspacesave" && project?.text)
      return { kind: "save", text: project.text };
    if (action === "workspaceloaded") return { kind: "loaded", id };
    return response && id ? { kind: "asked", id } : null;
  }
  const done = v.safeParse(doneSchema, data);
  if (done.success) return { kind: "done", id: done.output.id };
  if (v.is(backSchema, data)) return { kind: "back" };
  const program = v.safeParse(programSchema, data);
  return program.success
    ? {
        kind: "program",
        name: program.output.name ?? TARGET,
        hex: program.output.download,
      }
    : null;
}

/**
 * Asks the editor to hand over the project as it stands this moment. It
 * tells of a change a moment after it is made, which is too late for a
 * studio closed straight after one.
 */
export const saveNow = (id: string) => ({
  type: "pxteditor",
  action: "saveproject",
  id,
  response: true,
});

/** The answer the editor waits for after asking something it only needs heard. */
export const heard = (id: string) => ({ type: "pxthost", id, success: true });

function nameOf(files: readonly CodeFile[]): string {
  const config = files.find((file) => file.name === CONFIG);
  try {
    const name: unknown = (
      JSON.parse(config?.code ?? "{}") as { name?: unknown }
    ).name;
    return typeof name === "string" && name.trim() ? name : "Untitled";
  } catch {
    return "Untitled";
  }
}

/**
 * The answer to the editor's asking for its project: the kept files as the
 * one project it has, which it opens. `id` names the project for as long
 * as the editor is open; `now` is the time in seconds.
 */
export function synced(
  ask: string | undefined,
  files: readonly CodeFile[],
  editor: { id: string; version: string; now: number },
) {
  return {
    type: "pxthost",
    id: ask,
    success: true,
    controllerId: "farida",
    editor: {},
    projects: [
      {
        header: {
          id: editor.id,
          target: TARGET,
          targetVersion: editor.version,
          name: nameOf(files),
          meta: {},
          editor: editorOf(files),
          pubId: "",
          pubCurrent: false,
          _rev: null,
          recentUse: editor.now,
          modificationTime: editor.now,
          cloudUserId: null,
          cloudCurrent: false,
          cloudVersion: null,
          cloudLastSyncTime: 0,
          isDeleted: false,
        },
        text: textOf(files),
      },
    ],
  };
}

/**
 * The editor's address on the files host: told the page around it is its
 * host, which is what has it ask for its project and hand over what it
 * compiles, in the lesson's language, and kept from change where a
 * project is only looked at. The editor moves to `#editor` once its
 * project is open, and a frame that moves adds a step to the history of
 * the page around it, which that page's way back then lands on. Starting
 * there leaves it nowhere to move to.
 */
export function editorUrl(
  origin: string,
  options: { language: string; readOnly: boolean },
): string {
  const query = new URLSearchParams({
    controller: "2",
    lang: options.language,
  });
  if (options.readOnly) query.set("readonly", "1");
  return `${origin}/makecode/index.html?${query}#editor`;
}
