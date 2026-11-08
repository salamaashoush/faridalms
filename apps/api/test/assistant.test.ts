import type { AssistantEvent } from "@faridalms/domain/assistant";
import type { ContentDocument, ContentNode } from "@faridalms/domain/content";
import type { RouterClient } from "@orpc/server";

import { questionOfProposal } from "@faridalms/domain/assistant";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { SQL } from "bun";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import type {
  AssistantProvider,
  ProviderRequest,
} from "../src/assistant/provider";
import type { AppRouter } from "../src/router";

import { startAnthropicStandIn } from "../../../scripts/e2e-anthropic";
import { anthropicProvider } from "../src/assistant/anthropic";
import { ProviderError } from "../src/assistant/provider";
import { LOCALE_HEADER, SCHOOL_HEADER } from "../src/core/procedure";
import {
  handlerWith,
  login,
  rejection,
  seeded,
  sessionFor,
  testCell,
} from "./harness";

const SCHOOL = "northwind";
const TITLE = "Reading stories together";

const silent = (): string[] => [];

/**
 * A provider that answers from a script and keeps every request it was
 * sent, which is everything that left the school.
 */
function fakeProvider() {
  const sent: ProviderRequest[] = [];
  let answer: (request: ProviderRequest) => string[] = silent;
  let failure: ProviderError | null = null;
  const provider: AssistantProvider = {
    id: "anthropic",
    model: "claude-opus-5-5",
    async *stream(request) {
      sent.push(request);
      if (failure) throw failure;
      for (const text of answer(request)) yield { type: "text", text };
      yield { type: "end", stop: "end", inputTokens: 300, outputTokens: 90 };
    },
  };
  return {
    provider,
    sent,
    answer: (write: (request: ProviderRequest) => string[]) => {
      answer = write;
      failure = null;
    },
    fail: (error: ProviderError) => {
      failure = error;
    },
  };
}

const fake = fakeProvider();
let handler: (request: Request) => Promise<Response>;

function api(token: string): RouterClient<AppRouter> {
  return createORPCClient(
    new RPCLink({
      url: "http://api.test/rpc",
      headers: () => ({
        authorization: `Bearer ${token}`,
        [SCHOOL_HEADER]: SCHOOL,
        [LOCALE_HEADER]: "en",
      }),
      fetch: (request, init) => handler(new Request(request, init)),
    }),
  );
}

/** A request to the model as the editor sends it, and every line it answers with. */
async function run(token: string, body: unknown) {
  const response = await handler(
    new Request("http://api.test/v1/assistant/run", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        [SCHOOL_HEADER]: SCHOOL,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
  if (!response.ok)
    return {
      status: response.status,
      code: ((await response.json()) as { code: string }).code,
      events: [] as AssistantEvent[],
    };
  const text = await response.text();
  return {
    status: response.status,
    code: null,
    events: text
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as AssistantEvent),
  };
}

const text = (words: string, format = 0): ContentNode => ({
  type: "text",
  version: 1,
  text: words,
  format,
});
const paragraph = (...children: ContentNode[]): ContentNode => ({
  type: "paragraph",
  version: 1,
  children,
});

let teacher = { token: "", lessonId: "", moduleId: "", moduleVersion: 0 };
let principal: string;
let studentName: string;

/** The token the student's name went as, in what the provider was sent. */
const tokenIn = (request: ProviderRequest) =>
  /(\[\[P\d+\]\]) grew the tallest bean/.exec(request.user)?.[1] ?? "none";

/** What the provider was sent, all of it, as one text. */
const everythingSent = () =>
  fake.sent.map((request) => `${request.system}\n${request.user}`).join("\n");

const asked = questionOfProposal({
  kind: "text",
  prompt: "Name the green pigment.",
  options: [],
  answers: ["Secretkeyword"],
  items: [],
  pairs: [],
  passage: "",
  explanation: "",
});
if (!asked) throw new Error("no question");
const question: ContentNode = asked;

/** A lesson as a teacher writes it, with what must never leave inside it. */
function lessonContent(): ContentDocument {
  return {
    root: {
      type: "root",
      version: 1,
      children: [
        paragraph(text("Plants make food from light in their leaves.")),
        paragraph(
          text(`${studentName} grew the tallest bean in the class. Ask `),
          {
            type: "mention",
            version: 1,
            mention: {
              kind: "person",
              id: crypto.randomUUID(),
              label: "Mentioned Colleague",
            },
          },
          text(" for the seeds."),
        ),
        {
          type: "image",
          version: 1,
          fileId: crypto.randomUUID(),
          alt: `${studentName} watering the beans`,
        },
        question,
      ],
    },
  };
}

const host = () => ({ type: "lesson", id: teacher.lessonId });

beforeAll(async () => {
  handler = handlerWith({
    assistant: { providers: { anthropic: fake.provider }, dailyCeiling: 3 },
  });
  principal = (await sessionFor(SCHOOL, login("principal"))).token;
  const tenant = seeded().tenants[0];
  const school = tenant?.schools.find((row) => row.slug === SCHOOL);
  for (const row of tenant?.logins ?? []) {
    if (row.role !== "teacher" || row.schoolId !== school?.id) continue;
    const session = await sessionFor(SCHOOL, row.loginName);
    const source = (await session.api.learning.modules({})).rows.find(
      (item) => item.title === TITLE,
    );
    if (!source) continue;
    const module = await session.api.learning.saveModule({
      id: "",
      expectedVersion: 0,
      title: "Plants",
      summary: "",
      classIds: source.classes.map((item) => item.id),
      prerequisiteId: "",
      sequential: false,
    });
    const lesson = await session.api.learning.saveLesson({
      id: "",
      moduleId: module.id,
      expectedVersion: 0,
      title: "How plants feed",
      completion: "view",
      passScore: null,
      content: { root: { type: "root", version: 1, children: [] } },
      publish: false,
    });
    teacher = {
      token: session.token,
      lessonId: lesson.id,
      moduleId: module.id,
      moduleVersion: module.version,
    };
    break;
  }
  if (!teacher.token) throw new Error("no teacher of the module");
  const sql = new SQL(testCell().adminUrl);
  try {
    const [row] = await sql`
      select u.full_name_en from core.users u
      join core.user_roles r on r.tenant_id = u.tenant_id and r.user_id = u.id
      where r.role = 'student' and r.org_id = ${school?.id ?? ""}::uuid
        and u.full_name_en is not null
      limit 1`;
    studentName = (row as { full_name_en: string }).full_name_en;
  } finally {
    await sql.close();
  }
  // Signing in each teacher in turn to find the module's takes a while.
}, 30_000);

describe("a school's language model", () => {
  test("is off until an administrator turns it on, and only they may", async () => {
    const before = await api(principal).assistant.settings();
    expect(before).toMatchObject({ settings: null, providers: ["anthropic"] });
    expect(JSON.stringify(before)).not.toMatch(/key/i);
    expect(
      await run(teacher.token, {
        task: "level",
        host: host(),
        content: lessonContent(),
        language: "en",
        level: "early",
      }),
    ).toMatchObject({ status: 403, code: "assistant.off" });
    expect(await api(teacher.token).assistant.status()).toEqual({
      provider: null,
      remaining: 0,
    });
    expect(
      await rejection(
        api(teacher.token).assistant.saveSettings({
          expectedVersion: 0,
          enabled: true,
          provider: "anthropic",
          dailyLimit: 3,
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
    expect(
      await rejection(
        api(principal).assistant.saveSettings({
          expectedVersion: 0,
          enabled: true,
          provider: "anthropic",
          dailyLimit: 4,
        }),
      ),
    ).toMatchObject({ message: "assistant.over_ceiling" });
    await api(principal).assistant.saveSettings({
      expectedVersion: 0,
      enabled: true,
      provider: "anthropic",
      dailyLimit: 3,
    });
    expect(await api(teacher.token).assistant.status()).toEqual({
      provider: "anthropic",
      remaining: 3,
    });
    expect(fake.sent).toHaveLength(0);
  });

  test("sends a teacher's own words and nothing of their students", async () => {
    fake.answer((request) => [
      `{"questions":[{"kind":"choice","prompt":"What does ${tokenIn(request)} grow?",`,
      '"options":[{"text":"Beans","correct":true},{"text":"Stones","correct":false}],',
      '"answers":[],"items":[],"pairs":[],"passage":"","explanation":"See the text."}]}',
    ]);
    const answered = await run(teacher.token, {
      task: "questions",
      host: host(),
      content: lessonContent(),
      language: "en",
      count: 3,
    });
    expect(answered.status).toBe(200);
    const sent = everythingSent();
    expect(sent).toContain("Plants make food from light in their leaves.");
    expect(sent).toContain("Name the green pigment.");
    expect(sent).not.toContain(studentName);
    expect(sent).not.toContain("Mentioned Colleague");
    expect(sent).not.toContain("watering the beans");
    expect(sent).not.toContain("Secretkeyword");
    const proposed = answered.events.find((event) => event.type === "question");
    // The name the model was given as a token comes back as the name.
    expect(proposed).toMatchObject({
      question: { prompt: `What does ${studentName} grow?` },
      node: { type: "question", kind: "choice" },
    });
    expect(answered.events.at(-1)).toEqual({ type: "done" });
  });

  test("refuses a student's work, a student, and a record the teacher cannot change", async () => {
    const sentBefore = fake.sent.length;
    const withWork: ContentDocument = {
      root: {
        type: "root",
        version: 1,
        children: [
          paragraph(text("My essay.")),
          { type: "ai-use", version: 1 },
        ],
      },
    };
    expect(
      await run(teacher.token, {
        task: "level",
        host: host(),
        content: withWork,
        language: "en",
        level: "early",
      }),
    ).toMatchObject({ status: 403, code: "assistant.student_work" });
    const pupil = (await sessionFor(SCHOOL, login("student"))).token;
    expect(
      await run(pupil, {
        task: "level",
        host: host(),
        content: lessonContent(),
        language: "en",
        level: "early",
      }),
    ).toMatchObject({ status: 403, code: "assistant.staff_only" });
    expect(
      await run(teacher.token, {
        task: "level",
        host: { type: "lesson", id: crypto.randomUUID() },
        content: lessonContent(),
        language: "en",
        level: "early",
      }),
    ).toMatchObject({ status: 404 });
    expect(fake.sent.length).toBe(sentBefore);
  });

  test("drafts a translation that does not reach students until a person checks it", async () => {
    fake.answer((request) => [
      '{"translations":[{"i":0,"text":"تصنع النباتات غذاءها من الضوء."},',
      `{"i":1,"text":"زرع ${/\[\[P\d+\]\]/.exec(request.user)?.[0] ?? ""} أطول فاصوليا في الصف. اسأل "},`,
      '{"i":2,"text":" عن البذور."},{"i":3,"text":"سمِّ الصبغة الخضراء."}]}',
    ]);
    const content = lessonContent();
    const answered = await run(teacher.token, {
      task: "translate",
      host: host(),
      content,
      title: "",
      from: "en",
    });
    const drafted = answered.events.find(
      (event) => event.type === "translated",
    );
    if (drafted?.type !== "translated") throw new Error("no translation");
    expect(JSON.stringify(drafted.content)).toContain(studentName);
    expect(JSON.stringify(drafted.content)).toContain("Secretkeyword");
    expect(everythingSent()).not.toContain(studentName);

    const keeper = api(teacher.token);
    const draft = {
      id: teacher.lessonId,
      moduleId: teacher.moduleId,
      title: "How plants feed",
      completion: "view" as const,
      passScore: null,
      content,
      language: "en" as const,
      translation: { title: "كيف تتغذى النباتات", content: drafted.content },
    };
    const editing = await keeper.learning.lesson({ id: teacher.lessonId });
    const saved = await keeper.learning.saveLesson({
      ...draft,
      expectedVersion: editing.version,
      publish: false,
    });
    const opening = {
      id: teacher.moduleId,
      expectedVersion: teacher.moduleVersion,
    };
    expect(
      await rejection(keeper.learning.publishModule(opening)),
    ).toMatchObject({ message: "assistant.translation_unchecked" });
    const checked = await keeper.learning.reviewLessonTranslation({
      id: teacher.lessonId,
      expectedVersion: saved.version,
      reviewed: true,
    });
    await keeper.learning.publishModule(opening);
    expect(
      await keeper.learning.saveLesson({
        ...draft,
        expectedVersion: checked.version,
        publish: true,
      }),
    ).toMatchObject({ published: true });
  });

  test("records and audits each request, and holds the school to its day", async () => {
    fake.fail(new ProviderError("busy"));
    const busy = await run(teacher.token, {
      task: "level",
      host: host(),
      content: lessonContent(),
      language: "en",
      level: "upper_primary",
    });
    expect(busy.events.at(-1)).toEqual({
      type: "error",
      code: "assistant.busy",
    });
    expect(
      await run(teacher.token, {
        task: "level",
        host: host(),
        content: lessonContent(),
        language: "en",
        level: "upper_primary",
      }),
    ).toMatchObject({ status: 429, code: "assistant.daily_limit" });
    const sql = new SQL(testCell().adminUrl);
    try {
      const rows = await sql`
        select task, model, outcome, sent_characters, input_tokens
        from core.assistant_requests where host_id = ${teacher.lessonId}::uuid
        order by created_at`;
      expect(
        rows.map((row: { task: string; outcome: string }) => [
          row.task,
          row.outcome,
        ]),
      ).toEqual([
        ["questions", "done"],
        ["translate", "done"],
        ["level", "failed"],
      ]);
      expect(rows[0]).toMatchObject({
        model: "claude-opus-5-5",
        input_tokens: 300,
      });
      expect(
        (rows[0] as { sent_characters: number }).sent_characters,
      ).toBeGreaterThan(0);
      const audited = await sql`
        select details from audit.log
        where action = 'assistant.request' and object_id = ${teacher.lessonId}::uuid`;
      expect(audited).toHaveLength(3);
    } finally {
      await sql.close();
    }
  });
});

describe("Anthropic's adapter", () => {
  const port = 3290 + Math.floor(Math.random() * 100);
  const standIn = startAnthropicStandIn(port);
  afterAll(() => standIn.stop(true));
  const provider = anthropicProvider({
    apiKey: "sk-ant-e2e",
    baseURL: `http://127.0.0.1:${port}`,
    model: "claude-opus-5-5",
  });
  const collect = async () => {
    const seen: string[] = [];
    for await (const event of provider.stream(
      { system: "s", user: "u" },
      new AbortController().signal,
    ))
      seen.push(event.type === "text" ? "text" : event.type);
    return seen;
  };

  test("waits as long as a refusal asks, then goes", async () => {
    standIn.busyFor(1);
    const started = Date.now();
    const seen = await collect();
    expect(seen[0]).toBe("waiting");
    expect(seen.at(-1)).toBe("end");
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
  });

  test("holds the next request until the limit it reported resets", async () => {
    standIn.exhaust();
    await collect();
    const seen = await collect();
    expect(seen[0]).toBe("waiting");
    expect(standIn.requests.at(-1)?.model).toBe("claude-opus-5-5");
  });
});
