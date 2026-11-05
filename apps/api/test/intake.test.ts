import type { RouterClient } from "@orpc/server";

import { SEED_PASSWORD } from "@faridalms/database/seed";
import { verifyIntake } from "@faridalms/domain/leads";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { afterAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";

import type { AppRouter } from "../src/router";

import { SCHOOL_HEADER } from "../src/core/procedure";
import { handlerWith, login, rejection, seeded } from "./harness";

const secret = randomBytes(32).toString("base64");
const received: { body: Record<string, unknown>; signed: boolean }[] = [];

/** The operator console's intake, as the API meets it. */
const standIn = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(request) {
    const body = await request.text();
    received.push({
      body: JSON.parse(body) as Record<string, unknown>,
      signed: verifyIntake({
        secret,
        timestamp: request.headers.get("x-farida-timestamp"),
        signature: request.headers.get("x-farida-signature"),
        body,
        now: new Date(),
      }),
    });
    return Response.json({ id: crypto.randomUUID(), created: true });
  },
});

afterAll(() => standIn.stop(true));

const handler = handlerWith({
  intake: { url: `http://127.0.0.1:${standIn.port}/intake/leads`, secret },
});

function api(
  school: string,
  headers: Record<string, string> = {},
): RouterClient<AppRouter> {
  return createORPCClient(
    new RPCLink({
      url: "http://api.test/rpc",
      headers: () => ({ ...headers, [SCHOOL_HEADER]: school }),
      fetch: (sent, init) => handler(new Request(sent, init)),
    }),
  );
}

describe("leads for the operator console", () => {
  test("a demonstration request is emailed and sent to the console, signed", async () => {
    const before = received.length;
    expect(
      await api("", { "x-forwarded-for": "198.51.100.91" }).product.requestDemo(
        {
          locale: "ar",
          name: "Salama Ashoush",
          email: "salama@example.com",
          school: "Nile Valley School",
          role: "leader",
          size: "over_1000",
          phone: "",
          message: "",
          website: "",
          elapsed: 8000,
        },
      ),
    ).toEqual({ received: true });
    const [lead] = received.slice(before);
    expect(lead?.signed).toBe(true);
    expect(lead?.body).toMatchObject({
      source: "demo_form",
      organisation: "Nile Valley School",
      email: "salama@example.com",
      size: "over_1000",
      locale: "ar",
      phone: null,
      message: null,
    });
  });

  test("a school's administrator asks about a module its plan does not have, once a day", async () => {
    const tenant = seeded().tenants.findIndex((row) =>
      row.schools.some((school) => school.slug === "fernhill"),
    );
    const school = seeded().tenants[tenant]?.schools.find(
      (row) => row.slug === "fernhill",
    );
    if (!school) throw new Error("no fernhill school");
    const session = await api("fernhill").identity.signIn({
      loginName: login("principal", tenant),
      password: SEED_PASSWORD,
    });
    const principal = api("fernhill", {
      authorization: `Bearer ${session.token}`,
    });
    expect((await principal.school.features()).canAsk).toBe(true);
    const before = received.length;
    expect(await principal.school.askAboutModule({ module: "coding" })).toEqual(
      { asked: "coding" },
    );
    await principal.school.askAboutModule({ module: "coding" });
    const asked = received.slice(before);
    expect(asked).toHaveLength(2);
    expect(asked[0]?.signed).toBe(true);
    expect(asked[0]?.body).toMatchObject({
      source: "module_interest",
      module: "coding",
      schoolId: school.id,
      organisation: "Fernhill School",
    });
    // The same question the same day is the same lead to the console.
    expect(asked[1]?.body.intakeId).toBe(asked[0]?.body.intakeId);
    expect(
      await rejection(principal.school.askAboutModule({ module: "news" })),
    ).toMatchObject({ message: "module.in_plan" });
  });
});
