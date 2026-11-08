/** The key the stand-in takes, as the gate gives the API. */
export const KEY = "sk-ant-e2e";

/**
 * Anthropic's Messages API as the end-to-end gate and the API's tests meet
 * it: the API streams its teachers' requests here (ANTHROPIC_API_URL), and
 * a spec reads what was sent at `/e2e/requests` to prove no student's name
 * or work left. It answers each kind of request with a fixed answer of the
 * shape that request asks for, and reports its limits in Anthropic's
 * headers; `busyFor` makes the next request wait that many seconds first.
 */
export function startAnthropicStandIn(port: number) {
  const requests: { system: string; user: string; model: string }[] = [];
  let busy = 0;
  let exhausted = false;
  const server = Bun.serve({
    port,
    hostname: "127.0.0.1",
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/e2e/requests")
        return Response.json(requests);
      if (request.method !== "POST" || url.pathname !== "/v1/messages")
        return Response.json(
          { type: "error", error: { type: "not_found_error" } },
          { status: 404 },
        );
      const key =
        request.headers.get("x-api-key") ??
        request.headers.get("authorization")?.replace(/^Bearer /, "");
      if (key !== KEY)
        return Response.json(
          { type: "error", error: { type: "authentication_error" } },
          { status: 401 },
        );
      const body = (await request.json()) as {
        model: string;
        system: string;
        messages: { content: string }[];
        output_config?: { format?: { schema?: { properties?: object } } };
      };
      const user = body.messages[0]?.content ?? "";
      requests.push({ system: body.system, user, model: body.model });
      if (busy > 0) {
        const seconds = busy;
        busy = 0;
        return Response.json(
          { type: "error", error: { type: "rate_limit_error" } },
          { status: 429, headers: { "retry-after": String(seconds) } },
        );
      }
      const kind = Object.keys(
        body.output_config?.format?.schema?.properties ?? {},
      )[0];
      const answer =
        kind === "questions"
          ? JSON.stringify({ questions: QUESTIONS })
          : kind === "translations"
            ? JSON.stringify({ translations: translated(user) })
            : "A short and simple text.\n\nIt has two parts.";
      const remaining = exhausted ? "0" : "49";
      exhausted = false;
      return new Response(events(body.model, answer), {
        headers: {
          "content-type": "text/event-stream",
          "anthropic-ratelimit-requests-limit": "50",
          "anthropic-ratelimit-requests-remaining": remaining,
          "anthropic-ratelimit-requests-reset": new Date(
            Date.now() + 1000,
          ).toISOString(),
        },
      });
    },
  });
  return {
    server,
    requests,
    /** The next request is refused with a wait of this many seconds. */
    busyFor(seconds: number) {
      busy = seconds;
    },
    /** The next answer reports no requests left until a second from now. */
    exhaust() {
      exhausted = true;
    },
    stop: (force?: boolean) => server.stop(force),
  };
}

const QUESTIONS = [
  {
    kind: "choice",
    prompt: "What do plants need to make their food?",
    options: [
      { text: "Light", correct: true },
      { text: "Darkness", correct: false },
      { text: "Noise", correct: false },
    ],
    answers: [],
    items: [],
    pairs: [],
    passage: "",
    explanation: "Plants use light to make food.",
  },
  {
    kind: "gaps",
    prompt: "Fill in the missing word.",
    options: [],
    answers: [],
    items: [],
    pairs: [],
    passage: "Plants make food in their [[leaves]].",
    explanation: "Leaves hold the green pigment.",
  },
];

/** Each numbered passage of a translation request, marked as translated. */
function translated(user: string) {
  const json = /<material>\n([\s\S]*)\n<\/material>/.exec(user)?.[1] ?? "[]";
  const passages = JSON.parse(json) as { i: number; text: string }[];
  return passages.map(({ i, text }) => ({
    i,
    text: /<t\d+>/.test(text)
      ? text.replaceAll(/<t(\d+)>/g, "<t$1>ترجمة ")
      : `ترجمة ${text}`,
  }));
}

const line = (event: string, data: object) =>
  `event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`;

/** An answer as the server-sent events Anthropic streams it in. */
function events(model: string, text: string) {
  const chunks = text.match(/[\s\S]{1,40}/g) ?? [];
  return [
    line("message_start", {
      message: {
        id: `msg_${crypto.randomUUID()}`,
        type: "message",
        role: "assistant",
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 120, output_tokens: 1 },
      },
    }),
    line("content_block_start", {
      index: 0,
      content_block: { type: "text", text: "" },
    }),
    ...chunks.map((chunk) =>
      line("content_block_delta", {
        index: 0,
        delta: { type: "text_delta", text: chunk },
      }),
    ),
    line("content_block_stop", { index: 0 }),
    line("message_delta", {
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: Math.ceil(text.length / 4) },
    }),
    line("message_stop", {}),
  ].join("");
}
