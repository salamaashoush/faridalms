import type { RouterClient } from "@orpc/server";

import { openDirectoryAdmin } from "@faridalms/database/directory/admin";
import { SEED_PASSWORD } from "@faridalms/database/seed";
import { billingQuery, verifyIntake } from "@faridalms/domain/intake";
import { MODULE_IDS } from "@faridalms/domain/modules";
import { cardModules } from "@faridalms/domain/plans";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { afterAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";

import type { AppRouter } from "../src/router";

import { SCHOOL_HEADER } from "../src/core/procedure";
import {
  handlerWith,
  login,
  rejection,
  seeded,
  testDirectory,
} from "./harness";

const secret = randomBytes(32).toString("base64");
const received: { body: Record<string, unknown>; signed: boolean }[] = [];
const asked: { tenantId: string | null; signed: boolean }[] = [];
let billingAnswers = true;

/** The operator console's intake, as the API meets it. */
const standIn = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/intake/billing") {
      const tenantId = url.searchParams.get("tenantId");
      asked.push({
        tenantId,
        signed: verifyIntake({
          secret,
          timestamp: request.headers.get("x-farida-timestamp"),
          signature: request.headers.get("x-farida-signature"),
          body: billingQuery(tenantId ?? ""),
          now: new Date(),
        }),
      });
      if (!billingAnswers) return new Response(null, { status: 503 });
      return Response.json({
        customer: {
          name: "Fernhill Schools",
          nameAr: null,
          address: null,
          taxNumber: "123",
        },
        business: null,
        vatName: { en: "VAT", ar: "ضريبة القيمة المضافة" },
        invoices: [
          {
            id: crypto.randomUUID(),
            number: "INV-2026-00001",
            state: "issued",
            issuedOn: "2026-09-01",
            dueOn: "2026-10-01",
            currency: "EGP",
            language: "en",
            purchaseOrder: null,
            vatPercent: 14,
            reverseCharge: false,
            subtotalMinor: 100_000,
            vatMinor: 14_000,
            totalMinor: 114_000,
            owedMinor: 114_000,
            paymentLinkUrl: null,
            lines: [],
            credits: [],
          },
        ],
        contacts: [],
      });
    }
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
    const questions = received.slice(before);
    expect(questions).toHaveLength(2);
    expect(questions[0]?.signed).toBe(true);
    expect(questions[0]?.body).toMatchObject({
      source: "module_interest",
      module: "coding",
      schoolId: school.id,
      organisation: "Fernhill School",
    });
    // The same question the same day is the same lead to the console.
    expect(questions[1]?.body.intakeId).toBe(questions[0]?.body.intakeId);
    expect(
      await rejection(principal.school.askAboutModule({ module: "timetable" })),
    ).toMatchObject({ message: "module.in_plan" });
  });

  test("a school's card names what it has and what is on offer, and a module off offer cannot be asked about", async () => {
    const tenant = seeded().tenants.findIndex((row) =>
      row.schools.some((school) => school.slug === "fernhill"),
    );
    const session = await api("fernhill").identity.signIn({
      loginName: login("principal", tenant),
      password: SEED_PASSWORD,
    });
    const principal = api("fernhill", {
      authorization: `Bearer ${session.token}`,
    });
    const admin = openDirectoryAdmin(testDirectory().operatorUrl);
    const card = async () => {
      const [features, user] = await Promise.all([
        principal.school.features(),
        principal.identity.currentUser(),
      ]);
      return cardModules({
        modules: MODULE_IDS,
        has: (module) => user.modules[module],
        offered: features.offered,
      });
    };
    try {
      expect((await principal.school.features()).offered).not.toContain("sso");
      expect(await card()).not.toContain("sso");
      expect(await card()).toContain("sms");
      expect(
        await admin.setOffer({
          module: "sms",
          offered: false,
          operatorId: "salama-test",
          reason: "Not ready to sell",
        }),
      ).toBe(true);
      expect(
        await admin.setOffer({
          module: "sms",
          offered: false,
          operatorId: "salama-test",
          reason: "Twice",
        }),
      ).toBe(false);
      await admin.setOffer({
        module: "coursework",
        offered: false,
        operatorId: "salama-test",
        reason: "Sold only inside plans",
      });
      const listed = await card();
      expect(listed).not.toContain("sms");
      expect(listed).toContain("coursework");
      expect(listed).toContain("coding");
      const before = received.length;
      expect(
        await Promise.all(
          (["sms", "sso"] as const).map((module) =>
            rejection(principal.school.askAboutModule({ module })),
          ),
        ),
      ).toMatchObject([
        { message: "module.not_offered" },
        { message: "module.not_offered" },
      ]);
      expect(
        await rejection(
          principal.school.askAboutModule({ module: "coursework" }),
        ),
      ).toMatchObject({ message: "module.in_plan" });
      expect(received.length).toBe(before);
      const [latest] = await admin.changes({ type: "module" });
      expect(latest).toMatchObject({
        actor: "operator:salama-test",
        subjectId: "coursework",
        action: "module.withdraw",
        before: { offered: true },
        after: { offered: false },
        reason: "Sold only inside plans",
      });
    } finally {
      await Promise.all(
        (["sms", "coursework"] as const).map((module) =>
          admin.setOffer({
            module,
            offered: true,
            operatorId: "salama-test",
            reason: "Back on offer",
          }),
        ),
      );
      await admin.close();
    }
    expect(await card()).toContain("sms");
  });

  test("every module can be taken off offer and put back", async () => {
    const admin = openDirectoryAdmin(testDirectory().operatorUrl);
    try {
      const others = MODULE_IDS.filter((id) => id !== "sso");
      const change = (offered: boolean) =>
        Promise.all(
          others.map((module) =>
            admin.setOffer({
              module,
              offered,
              operatorId: "salama-test",
              reason: "Check",
            }),
          ),
        );
      expect(await change(false)).toEqual(others.map(() => true));
      expect(await change(true)).toEqual(others.map(() => true));
      expect(
        (await admin.offers())
          .filter((row) => !row.offered)
          .map((row) => row.module),
      ).toEqual(["sso"]);
    } finally {
      await admin.close();
    }
  });

  test("a school's billing is asked of the console, signed, for its own tenant alone", async () => {
    const tenant = seeded().tenants.findIndex((row) =>
      row.schools.some((school) => school.slug === "fernhill"),
    );
    const session = await api("fernhill").identity.signIn({
      loginName: login("principal", tenant),
      password: SEED_PASSWORD,
    });
    const principal = api("fernhill", {
      authorization: `Bearer ${session.token}`,
    });
    const before = asked.length;
    expect(await principal.billing.overview()).toMatchObject({
      available: true,
      invoices: [{ number: "INV-2026-00001", owedMinor: 114_000 }],
    });
    expect(asked.slice(before)).toEqual([
      { tenantId: seeded().tenants[tenant]?.tenantId ?? "", signed: true },
    ]);
    billingAnswers = false;
    try {
      expect(await principal.billing.overview()).toEqual({ available: false });
    } finally {
      billingAnswers = true;
    }

    // A teacher holds no billing:read.
    const teacher = await api("fernhill").identity.signIn({
      loginName: login("teacher", tenant),
      password: SEED_PASSWORD,
    });
    expect(
      await rejection(
        api("fernhill", {
          authorization: `Bearer ${teacher.token}`,
        }).billing.overview(),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});
