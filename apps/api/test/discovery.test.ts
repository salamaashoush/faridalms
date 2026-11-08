import { SEED_PASSWORD } from "@faridalms/database/seed";
import { SQL } from "bun";
import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";

import {
  client,
  login,
  rejection,
  seeded,
  signedIn,
  testCell,
  testDirectory,
} from "./harness";

const names = (en: string, ar: string) => ({
  en: { given: en.split(" ")[0], family: en.split(" ").slice(1).join(" ") },
  ar: { given: ar.split(" ")[0], family: ar.split(" ").slice(1).join(" ") },
});

/** The bare portal domain names no school: its calls carry none. */
const bare = (network?: string) =>
  client("", undefined, "en", network ? { "x-forwarded-for": network } : {});

/** Opens a teacher's sign-in at a school with the name and password given. */
async function teacherAt(
  school: string,
  principal: string,
  loginName: string,
  password: string,
) {
  const api = await signedIn(school, principal);
  const saved = await api.people.saveStaff({
    names: names("Salama Hadi", "سلامة هادي"),
    email: loginName,
    roles: ["teacher"],
  });
  await api.people.saveSignIn({ userId: saved.id, loginName, password });
  return saved.id;
}

/** A handoff to Northwind, choosing it where the name opens more than one school. */
async function handoffFor(loginName: string, password: string) {
  const first = await bare().identity.discoverSignIn({ loginName, password });
  const answer =
    "handoff" in first
      ? first
      : await bare().identity.discoverSignIn({
          loginName,
          password,
          school: "northwind",
        });
  if (!("handoff" in answer)) throw new Error("no handoff came back");
  return answer.handoff;
}

describe("sign-in on the bare portal domain", () => {
  test("finds the one school a name and password open and hands off to its portal", async () => {
    const handoff = await handoffFor(login("principal"), SEED_PASSWORD);
    expect(handoff.slug).toBe("northwind");
    expect(handoff.portalHost).toBe("northwind.example.com");
    expect(handoff.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const session = await client("northwind").identity.redeemHandoff({
      token: handoff.token,
    });
    expect(session.workspace).toBe("staff");
    const me = await client("northwind", session.token).identity.currentUser();
    expect(me.workspace).toBe("staff");
  });

  test("names every school a person's name and password open, and only after the password", async () => {
    const loginName = "salama.both@example.org";
    const password = "two schools, one phrase";
    await teacherAt("northwind", login("principal"), loginName, password);
    await teacherAt("acme", login("principal", 1), loginName, password);
    expect(
      await rejection(
        bare().identity.discoverSignIn({ loginName, password: "not it" }),
      ),
    ).toMatchObject({ message: "auth.invalid_credentials" });
    const answer = await bare().identity.discoverSignIn({
      loginName,
      password,
    });
    expect(
      "schools" in answer ? answer.schools.map((s) => s.slug).toSorted() : [],
    ).toEqual(["acme", "northwind"]);
    const picked = await bare().identity.discoverSignIn({
      loginName,
      password,
      school: "acme",
    });
    expect("handoff" in picked ? picked.handoff.slug : null).toBe("acme");
  });

  test("a wrong password and an unknown name read the same", async () => {
    const wrong = await rejection(
      bare().identity.discoverSignIn({
        loginName: login("teacher"),
        password: "not the password",
      }),
    );
    const unknown = await rejection(
      bare().identity.discoverSignIn({
        loginName: "nobody.at.all@example.org",
        password: "not the password",
      }),
    );
    expect(wrong).toMatchObject({
      code: "BAD_REQUEST",
      message: "auth.invalid_credentials",
    });
    expect(unknown).toMatchObject({
      code: "BAD_REQUEST",
      message: "auth.invalid_credentials",
    });
  });

  test("a handoff works once", async () => {
    const { token } = await handoffFor(login("teacher"), SEED_PASSWORD);
    await client("northwind").identity.redeemHandoff({ token });
    expect(
      await rejection(client("northwind").identity.redeemHandoff({ token })),
    ).toMatchObject({ message: "auth.invalid_handoff" });
  });

  test("a handoff past its minute opens nothing", async () => {
    const { token } = await handoffFor(login("parent"), SEED_PASSWORD);
    const sql = new SQL(testCell().adminUrl);
    try {
      await sql`update core.login_identities
        set expires_at = statement_timestamp() - interval '1 second'
        where kind = 'handoff' and voided_at is null`;
    } finally {
      await sql.close();
    }
    expect(
      await rejection(client("northwind").identity.redeemHandoff({ token })),
    ).toMatchObject({ message: "auth.invalid_handoff" });
  });

  test("a handoff opens nothing at another school, and opens from another network", async () => {
    const { token } = await handoffFor(login("principal"), SEED_PASSWORD);
    expect(
      await rejection(
        client("northwind-east").identity.redeemHandoff({ token }),
      ),
    ).toMatchObject({ message: "auth.invalid_handoff" });
    // Spent by the try at the wrong school, as any try spends it.
    expect(
      await rejection(client("northwind").identity.redeemHandoff({ token })),
    ).toMatchObject({ message: "auth.invalid_handoff" });

    // Carrier-grade NAT moves one browser between public addresses, so the
    // portal may see another network than the bare domain did.
    const other = await handoffFor(login("principal"), SEED_PASSWORD);
    const session = await client("northwind", undefined, "en", {
      "x-forwarded-for": "198.51.100.7",
    }).identity.redeemHandoff({ token: other.token });
    expect(session.token).toBeString();
  });

  test("the bare domain counts tries per name, and each school's own limits still hold", async () => {
    const network = "203.0.113.77";
    const unknown = "nobody.counted@example.org";
    for (let attempt = 0; attempt < 20; attempt++)
      expect(
        await rejection(
          bare(network).identity.discoverSignIn({
            loginName: unknown,
            password: "guess",
          }),
        ),
      ).toMatchObject({ message: "auth.invalid_credentials" });
    expect(
      await rejection(
        bare(network).identity.discoverSignIn({
          loginName: unknown,
          password: "guess",
        }),
      ),
    ).toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: "auth.too_many_attempts",
    });

    // An account of its own: the school's limit would hold the name for a
    // quarter of an hour.
    const known = "salama.limited@example.org";
    const password = "the right phrase at last";
    await teacherAt("northwind", login("principal"), known, password);
    const school = "203.0.113.78";
    for (let attempt = 0; attempt < 10; attempt++)
      await rejection(
        bare(school).identity.discoverSignIn({
          loginName: known,
          password: "guess",
        }),
      );
    expect(
      await rejection(
        bare(school).identity.discoverSignIn({
          loginName: known,
          password,
        }),
      ),
    ).toMatchObject({ message: "auth.too_many_attempts" });
  });

  test("a forgotten password asked for there answers the same for any name", async () => {
    for (const loginName of [login("teacher", 0, 1), "nobody@example.org"])
      expect(await bare().identity.discoverReset({ loginName })).toEqual({
        requested: true,
      });
  });
});

describe("the directory's index of sign-in names", () => {
  test("holds only keyed hashes, and a new sign-in name reaches it", async () => {
    const loginName = "salama.indexed@example.org";
    const sql = new SQL(testDirectory().adminUrl);
    try {
      const count = async () =>
        (
          await sql<{ count: number }[]>`
            select count(*)::int as count from login_index`
        )[0]?.count;
      const before = (await count()) ?? 0;
      await teacherAt(
        "northwind",
        login("principal"),
        loginName,
        "a phrase to sign in",
      );
      expect(await count()).toBe(before + 1);
      const columns = await sql<{ column_name: string }[]>`
        select column_name from information_schema.columns
        where table_name = 'login_index' order by column_name`;
      expect(columns.map((row) => row.column_name)).toEqual([
        "key",
        "tenant_id",
      ]);
      const plain = await sql`
        select 1 from login_index where encode(key, 'escape') like ${"%" + loginName + "%"}`;
      expect(plain.length).toBe(0);
      // Without the platform's key, a name matches no row.
      const guessed = createHmac("sha256", "not the key")
        .update(loginName)
        .digest();
      expect(
        (await sql`select 1 from login_index where key = ${guessed}`).length,
      ).toBe(0);
    } finally {
      await sql.close();
    }
  });

  test("only the cell's sync login writes it, and readers only read it", async () => {
    const { syncUrl, operatorUrl } = testDirectory();
    const readerUrl = syncUrl.replace("directory_sync", "directory_reader");
    const tenantId = seeded().tenants[0]?.tenantId ?? "";
    const key = Buffer.alloc(32, 7);
    for (const url of [readerUrl, operatorUrl]) {
      const sql = new SQL(url);
      try {
        expect(
          await rejection(
            sql`insert into login_index (key, tenant_id) values (${key}, ${tenantId}::uuid)`,
          ),
        ).toMatchObject({ errno: "42501" });
      } finally {
        await sql.close();
      }
    }
    const operator = new SQL(operatorUrl);
    try {
      expect(
        await rejection(operator`select key from login_index limit 1`),
      ).toMatchObject({ errno: "42501" });
    } finally {
      await operator.close();
    }
    const sync = new SQL(syncUrl);
    try {
      await sync`insert into login_index (key, tenant_id) values (${key}, ${tenantId}::uuid)`;
      await sync`delete from login_index where key = ${key}`;
    } finally {
      await sync.close();
    }
  });
});
