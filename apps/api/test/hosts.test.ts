import { SQL } from "bun";
import { afterAll, describe, expect, test } from "bun:test";

import {
  client,
  DOMAINS,
  EDGE_ADDRESS,
  fakeDns,
  login,
  rejection,
  seeded,
  signedIn,
  testDirectory,
} from "./harness";

const ask = (domain: string, method = "GET") =>
  seeded().handler(
    new Request(
      `http://api.test/edge/ask?domain=${encodeURIComponent(domain)}`,
      { method },
    ),
  );

const superuser = () => new SQL(testDirectory().adminUrl);

const acme = () => {
  const school = seeded().tenants[1]?.schools[0];
  if (!school) throw new Error("seed");
  return school;
};

/** Puts a host in a state directly, as if the worker had moved it there. */
async function placeHost(
  hostname: string,
  input: { schoolId: string; role?: "site" | "portal"; state: string },
) {
  const sql = superuser();
  try {
    await sql`
      insert into hosts (hostname, school_id, role, challenge, state, verified_at)
      values (${hostname}, ${input.schoolId}::uuid, ${input.role ?? "site"},
        ${"c".repeat(32)}, ${input.state},
        ${input.state === "pending" ? null : new Date().toISOString()}::timestamptz)
      on conflict (hostname) do update set state = excluded.state`;
  } finally {
    await sql.close();
  }
}

const published = (
  hostname: string,
  challenge: string,
  target: { cname?: string; a?: string[] },
) =>
  fakeDns.records.set(hostname, {
    txt: [challenge],
    cname: target.cname ? [target.cname] : [],
    a: target.a ?? [],
  });

afterAll(async () => {
  const sql = superuser();
  try {
    await sql`update hosts set state = 'removed', canonical = false`;
  } finally {
    await sql.close();
  }
});

describe("the edge's on-demand TLS question", () => {
  test("is answered yes only for a school's own host that is verified or active", async () => {
    const { id: schoolId } = acme();
    await placeHost("pending.acme.test", { schoolId, state: "pending" });
    await placeHost("verified.acme.test", { schoolId, state: "verified" });
    await placeHost("active.acme.test", { schoolId, state: "active" });
    await placeHost("failing.acme.test", { schoolId, state: "failing" });
    await placeHost("removed.acme.test", { schoolId, state: "removed" });
    expect((await ask("pending.acme.test")).status).toBe(404);
    expect((await ask("verified.acme.test")).status).toBe(200);
    expect((await ask("Active.Acme.Test")).status).toBe(200);
    expect((await ask("failing.acme.test")).status).toBe(404);
    expect((await ask("removed.acme.test")).status).toBe(404);
    expect((await ask("nobody.example.org")).status).toBe(404);
  });

  test("covers an existing school's platform names and the edge's own, for an edge without wildcards", async () => {
    expect((await ask(`northwind.${DOMAINS.portal}`)).status).toBe(200);
    expect((await ask(`northwind.${DOMAINS.sites}`)).status).toBe(200);
    expect((await ask(DOMAINS.portal)).status).toBe(200);
    expect((await ask(DOMAINS.sites)).status).toBe(200);
    for (const label of ["www", "ops", "collab", "api"])
      expect((await ask(`${label}.${DOMAINS.portal}`)).status).toBe(200);
    for (const label of ["files", "play", "media"])
      expect((await ask(`${label}.${DOMAINS.sites}`)).status).toBe(200);
  });

  test("refuses a platform name no school holds and labels the edge does not serve", async () => {
    expect((await ask(`nobody-here.${DOMAINS.portal}`)).status).toBe(404);
    expect((await ask(`nobody-here.${DOMAINS.sites}`)).status).toBe(404);
    expect((await ask(`admin.${DOMAINS.portal}`)).status).toBe(404);
    expect((await ask(`ops.${DOMAINS.sites}`)).status).toBe(404);
    expect((await ask(`files.${DOMAINS.portal}`)).status).toBe(404);
    expect((await ask(`a.b.${DOMAINS.portal}`)).status).toBe(404);
    expect((await ask("203.0.113.10")).status).toBe(404);
  });

  test("refuses what is not a hostname and anything but GET", async () => {
    expect((await ask("not a host")).status).toBe(400);
    expect((await ask("")).status).toBe(400);
    expect((await ask("active.acme.test", "POST")).status).toBe(405);
  });
});

describe("routing by host", () => {
  test("names a school by its platform names, and nothing for names it does not know", async () => {
    const open = client("");
    expect(
      await open.identity.resolveHost({ host: `northwind.${DOMAINS.portal}` }),
    ).toEqual({ slug: "northwind", role: "portal", redirect: null });
    expect(
      await open.identity.resolveHost({
        host: `northwind-east.${DOMAINS.sites}:443`,
      }),
    ).toEqual({ slug: "northwind-east", role: "site", redirect: null });
    expect(
      await open.identity.resolveHost({ host: `nowhere.${DOMAINS.portal}` }),
    ).toBeNull();
    expect(
      await open.identity.resolveHost({ host: `www.${DOMAINS.portal}` }),
    ).toBeNull();
    expect(
      await open.identity.resolveHost({ host: "pending.acme.test" }),
    ).toBeNull();
  });

  test("a school's own host routes only while active", async () => {
    const open = client("");
    expect(
      await open.identity.resolveHost({ host: "active.acme.test" }),
    ).toEqual({ slug: "acme", role: "site", redirect: null });
    expect(
      await open.identity.resolveHost({ host: "verified.acme.test" }),
    ).toBeNull();
    expect(
      await open.identity.resolveHost({ host: "failing.acme.test" }),
    ).toBeNull();
  });
});

describe("a school's own address", () => {
  test("is verified from its records, activated once served over TLS, and then canonical", async () => {
    const api = await signedIn("acme", login("principal", 1));
    const hostname = "www.acme-school.example.org";
    const added = await api.hosts.add({
      hostname: "WWW.Acme-School.Example.org.",
      role: "site",
    });
    expect(added).toMatchObject({
      hostname,
      role: "site",
      state: "pending",
      canonical: true,
      checkedAt: null,
    });
    expect(added.records).toEqual({
      txt: {
        name: `_farida-challenge.${hostname}`,
        value: added.challenge,
      },
      cname: { name: hostname, target: `acme.${DOMAINS.sites}` },
      a: { name: hostname, address: EDGE_ADDRESS },
    });

    const missing = await api.hosts.check({ hostname });
    expect(missing).toMatchObject({
      state: "pending",
      lastError: "hosts.txt_missing",
    });
    expect(missing.checkedAt).not.toBeNull();

    published(hostname, added.challenge, { cname: `acme.${DOMAINS.sites}.` });
    expect(await api.hosts.check({ hostname })).toMatchObject({
      state: "verified",
      lastError: "hosts.tls_pending",
    });
    expect((await ask(hostname)).status).toBe(200);
    expect(
      await client("").identity.resolveHost({ host: `acme.${DOMAINS.sites}` }),
    ).toMatchObject({ redirect: null });

    fakeDns.servedOverTls.add(hostname);
    expect(await api.hosts.check({ hostname })).toMatchObject({
      state: "active",
      lastError: null,
    });
    expect(
      await client("").identity.resolveHost({ host: `acme.${DOMAINS.sites}` }),
    ).toEqual({ slug: "acme", role: "site", redirect: hostname });
    expect(await client("").identity.resolveHost({ host: hostname })).toEqual({
      slug: "acme",
      role: "site",
      redirect: null,
    });
  });

  test("the website's way to sign in leads to the school's portal", async () => {
    const site = await client("").site.publicSite({ school: "northwind" });
    expect(site.portalHost).toBe(`northwind.${DOMAINS.portal}`);
  });

  test("stops routing after three rechecks that miss, and the worker says why", async () => {
    const { hosts } = seeded();
    const api = await signedIn("acme", login("principal", 1));
    const hostname = "www.acme-school.example.org";
    fakeDns.records.delete(hostname);
    for (let pass = 0; pass < 3; pass += 1) {
      await api.hosts.check({ hostname });
    }
    const row = (await hosts.registry.list(acme().id)).find(
      (host) => host.hostname === hostname,
    );
    expect(row).toMatchObject({
      state: "failing",
      failures: 3,
      lastError: "hosts.txt_missing",
    });
    expect((await ask(hostname)).status).toBe(404);
    expect(
      await client("").identity.resolveHost({ host: `acme.${DOMAINS.sites}` }),
    ).toMatchObject({ redirect: null });
    const sql = superuser();
    try {
      const log = await sql`select action, actor from changes
        where subject_type = 'host' and subject_id = ${hostname} order by occurred_at`;
      expect(log.map((entry: { action: string }) => entry.action)).toEqual([
        "host.add",
        "host.verified",
        "host.active",
        "host.failing",
      ]);
      expect(
        log.every((entry: { actor: string }) => entry.actor === "cell:eg-1"),
      ).toBe(true);
    } finally {
      await sql.close();
    }
  });

  test("the sweep checks what is due and leaves what was checked within the hour", async () => {
    const api = await signedIn("acme", login("principal", 1));
    const hostname = "portal.acme-school.example.org";
    const added = await api.hosts.add({ hostname, role: "portal" });
    published(hostname, added.challenge, { a: [EDGE_ADDRESS] });
    const { hosts } = seeded();
    expect(await hosts.checks.sweep()).toBeGreaterThanOrEqual(1);
    const after = (await hosts.registry.list(acme().id)).find(
      (host) => host.hostname === hostname,
    );
    expect(after?.state).toBe("verified");
    const again = await hosts.checks.sweep();
    expect(
      (await hosts.registry.list(acme().id)).find(
        (host) => host.hostname === hostname,
      )?.checkedAt,
    ).toBe(after?.checkedAt ?? "");
    expect(again).toBe(0);
  });

  test("is refused when another school holds it, under the platform's domains, or twice", async () => {
    const acmeApi = await signedIn("acme", login("principal", 1));
    const northwind = await signedIn("northwind", login("principal"));
    expect(
      await rejection(
        northwind.hosts.add({
          hostname: "www.acme-school.example.org",
          role: "site",
        }),
      ),
    ).toMatchObject({ message: "hosts.taken" });
    expect(
      await rejection(
        acmeApi.hosts.add({
          hostname: "portal.acme-school.example.org",
          role: "portal",
        }),
      ),
    ).toMatchObject({ message: "hosts.exists" });
    expect(
      await rejection(
        acmeApi.hosts.add({
          hostname: `acme.${DOMAINS.portal}`,
          role: "portal",
        }),
      ),
    ).toMatchObject({ message: "hosts.platform" });
    expect(
      await rejection(
        northwind.hosts.check({ hostname: "portal.acme-school.example.org" }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
  });

  test("needs the website's managers", async () => {
    const teacher = await signedIn("acme", login("teacher", 1));
    expect(await rejection(teacher.hosts.list())).toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("links in email", () => {
  test("go to the school's canonical portal: its own once active, else its platform name", async () => {
    const { mail } = seeded();
    const loginName = login("principal", 1);
    const open = client("acme");
    const linkOf = async () => {
      const before = mail.sent.length;
      await open.identity.requestPasswordReset({ loginName });
      const message = mail.sent.slice(before).at(-1);
      return /https:\/\/[^\s"<>]+\/welcome\?school=acme#[A-Za-z0-9_-]{43}/.exec(
        message?.text ?? "",
      )?.[0];
    };
    expect(await linkOf()).toStartWith(
      `https://acme.${DOMAINS.portal}/welcome?school=acme#`,
    );
    await placeHost("portal.acme-own.example.org", {
      schoolId: acme().id,
      role: "portal",
      state: "active",
    });
    const sql = superuser();
    try {
      await sql`update hosts set canonical = false
        where school_id = ${acme().id}::uuid and role = 'portal'`;
      await sql`update hosts set canonical = true
        where hostname = 'portal.acme-own.example.org'`;
    } finally {
      await sql.close();
    }
    expect(await linkOf()).toStartWith(
      "https://portal.acme-own.example.org/welcome?school=acme#",
    );
  });
});

describe("the cell's directory login", () => {
  test("can never move a host to another school or rename it", async () => {
    const sync = new SQL(testDirectory().syncUrl);
    const northwind = seeded().tenants[0]?.schools[0];
    try {
      expect(
        await rejection(
          sync`update hosts set school_id = ${northwind?.id ?? ""}::uuid
            where hostname = 'active.acme.test'`,
        ),
      ).toMatchObject({ errno: "42501" });
      expect(
        await rejection(
          sync`update hosts set hostname = 'other.acme.test'
            where hostname = 'active.acme.test'`,
        ),
      ).toMatchObject({ errno: "42501" });
      expect(
        await rejection(
          sync`delete from hosts where hostname = 'active.acme.test'`,
        ),
      ).toMatchObject({ errno: "42501" });
    } finally {
      await sync.close();
    }
  });

  test("keeps one canonical host per school and role", async () => {
    const sql = superuser();
    try {
      await sql`update hosts set canonical = false where school_id = ${acme().id}::uuid`;
      await sql`update hosts set canonical = true where hostname = 'active.acme.test'`;
      expect(
        await rejection(
          sql`update hosts set canonical = true where hostname = 'verified.acme.test'`,
        ),
      ).toMatchObject({ errno: "23505" });
    } finally {
      await sql.close();
    }
  });
});
