import type { LessonDocument } from "@faridalms/domain/learning";
import type { RouterClient } from "@orpc/server";

import { createCollab, serve } from "@faridalms/collab";
import { openCollab } from "@faridalms/database/context";
import { signTicket } from "@faridalms/domain/collab";
import { plainContent } from "@faridalms/domain/content-conversion";
import { contentOfLesson } from "@faridalms/domain/lesson-content";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { afterAll, describe, expect, test } from "bun:test";
import * as Y from "yjs";

import type { AppRouter } from "../src/router";

import { LOCALE_HEADER, SCHOOL_HEADER } from "../src/core/procedure";
import { handlerWith, login, rejection, seeded, sessionFor } from "./harness";

const TITLE = "Reading stories together";
const id = () => crypto.randomUUID();

const collab = openCollab(seeded().collabUrl);
const server = serve(
  createCollab({ collab, cellSecret: seeded().cellSecret }),
  0,
  seeded().cellSecret,
);
const signalUrl = `http://127.0.0.1:${server.port}/signal`;
const handler = handlerWith({ signalUrl });
afterAll(async () => {
  await server.stop(true);
  await collab.close();
});

/** A client of the API built to signal the collaboration server above. */
function signalling(token: string) {
  const link = new RPCLink({
    url: "http://api.test/rpc",
    headers: () => ({
      authorization: `Bearer ${token}`,
      [SCHOOL_HEADER]: "northwind",
      [LOCALE_HEADER]: "en",
    }),
    fetch: (request, init) => handler(new Request(request, init)),
  });
  const api: RouterClient<AppRouter> = createORPCClient(link);
  return api;
}

async function as(loginName: string) {
  const { token } = await sessionFor("northwind", loginName);
  return signalling(token);
}

function written(blocks: LessonDocument["blocks"]) {
  const document = contentOfLesson({ version: 2, blocks });
  if (!document) throw new Error("the blocks could not become a document");
  return document;
}

/** A listener in a lesson's pacing room, as a student's player joins it. */
function listen(room: string, token: string) {
  const heard: string[] = [];
  const failed: string[] = [];
  const provider = new HocuspocusProvider({
    url: `ws://127.0.0.1:${server.port}`,
    name: room,
    token,
    document: new Y.Doc(),
    awareness: null,
    onStateless: ({ payload }) => heard.push(payload),
    onAuthenticationFailed: ({ reason }) => failed.push(reason),
  });
  const synced = new Promise<void>((resolve) =>
    provider.on("synced", () => resolve()),
  );
  return { provider, heard, failed, synced };
}

async function until(check: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (check()) return;
    await Bun.sleep(30);
  }
  throw new Error("waited too long");
}

/** The seeded teacher of the reading module, their class with the student in it, and another of theirs. */
async function cast() {
  const tenant = seeded().tenants[0];
  const school = tenant?.schools.find((row) => row.slug === "northwind");
  const names = (tenant?.logins ?? [])
    .filter((row) => row.role === "teacher" && row.schoolId === school?.id)
    .map((row) => row.loginName);
  const pupil = await as(login("student"));
  const me = await pupil.identity.currentUser();
  for (const name of names) {
    const keeper = await as(name);
    const { rows } = await keeper.learning.modules({});
    const source = rows.find((row) => row.title === TITLE);
    if (!source) continue;
    for (const item of source.classes) {
      const { roster } = await keeper.coursework.groups({ classId: item.id });
      if (!roster.some((row) => row.id === me.id)) continue;
      const other = (await keeper.learning.options()).classes.find(
        (row) => row.id !== item.id,
      );
      if (!other) throw new Error("the teacher writes for one class only");
      return { keeper, pupil, classId: item.id, otherId: other.id };
    }
  }
  throw new Error("the seed lacks a teacher of the student's class");
}

describe("a lesson led live, pushed", () => {
  test("a student's player hears the teacher start, move and end the lesson", async () => {
    const { keeper, pupil, classId, otherId } = await cast();
    const module = async (title: string, classIds: string[]) => {
      const saved = await keeper.learning.saveModule({
        id: "",
        expectedVersion: 0,
        title,
        summary: "",
        classIds,
        prerequisiteId: "",
        sequential: false,
      });
      const lesson = await keeper.learning.saveLesson({
        id: "",
        moduleId: saved.id,
        expectedVersion: 0,
        title: "Seasons",
        completion: "view",
        passScore: null,
        content: written([
          { id: id(), type: "content", content: plainContent("Spring.") },
          { id: id(), type: "gate", requires: "none" },
          { id: id(), type: "content", content: plainContent("Summer.") },
        ]),
        publish: false,
      });
      await keeper.learning.publishModule({
        id: saved.id,
        expectedVersion: saved.version,
      });
      return lesson;
    };
    const led = await module("Seasons together", [classId]);
    const apart = await module("Seasons elsewhere", [otherId]);

    // Only those who may read where the class is listen: the module's
    // teachers and the students it reaches.
    expect(
      await rejection(pupil.learning.pacingChannel({ lessonId: apart.id })),
    ).toMatchObject({ code: "NOT_FOUND" });
    const channel = await pupil.learning.pacingChannel({ lessonId: led.id });
    const teacherChannel = await keeper.learning.pacingChannel({
      lessonId: led.id,
    });
    expect(teacherChannel.room).toBe(channel.room);

    const student = listen(channel.room, channel.token);
    await student.synced;
    // A ticket names its room; one for another room is turned away.
    const elsewhere = listen(`${channel.room}x`, channel.token);
    await until(() => elsewhere.failed.length > 0);
    elsewhere.provider.destroy();

    const started = await keeper.learning.startPaced({
      lessonId: led.id,
      classId,
    });
    await until(() => student.heard.length === 1);
    await keeper.learning.pace({ id: started.id, step: 1 });
    await until(() => student.heard.length === 2);
    // Showing answers on the board moves nobody, so nobody is told.
    await keeper.learning.pace({ id: started.id, revealed: true });
    await keeper.learning.pace({ id: started.id, paused: true });
    await until(() => student.heard.length === 3);
    expect(await pupil.learning.pacing({ lessonId: led.id })).toEqual({
      paced: { id: started.id, step: 1, paused: true },
    });
    await keeper.learning.endPaced({ id: started.id });
    await until(() => student.heard.length === 4);
    expect(student.heard).toEqual(["pacing", "pacing", "pacing", "pacing"]);

    // The signal address takes only what the API signed as a signal: a
    // listener's own ticket sent there is refused.
    const forged = await fetch(signalUrl, {
      method: "POST",
      body: channel.token,
    });
    expect(forged.status).toBe(403);
    const ticket = await signTicket(
      {
        kind: "pacing",
        tenantId: seeded().tenants[0]?.tenantId ?? "",
        lessonId: led.id,
        userId: id(),
        expiresAt: Math.floor(Date.now() / 1000) + 60,
      },
      seeded().cellSecret,
    );
    expect(
      (await fetch(signalUrl, { method: "POST", body: ticket })).status,
    ).toBe(403);
    student.provider.destroy();
  });
});
