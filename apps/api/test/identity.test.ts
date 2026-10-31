import { SEED_PASSWORD } from "@faridalms/database/seed";
import { describe, expect, test } from "bun:test";

import { client, login, rejection, seeded, signedIn } from "./harness";

describe("sign-in", () => {
  test("a legal guardian reaches the family workspace only with portal access", async () => {
    const password = "correct horse battery staple";
    const api = await signedIn("northwind", login("principal"));
    const options = await api.people.options();
    const father = options.relations.find((row) => row.code === "father");
    if (!father) throw new Error("options");
    const studentId =
      (await api.people.students({ q: "NO1012" })).rows[0]?.id ?? "";
    const flags = {
      relationId: father.id,
      legalGuardian: true,
      portalAccess: false,
      receivesNotifications: true,
      primaryContact: false,
      emergencyContact: false,
      residence: "secondary" as const,
      pickup: "allowed" as const,
    };
    await api.people.saveRelationship({
      studentId,
      person: {
        names: {
          en: { given: "Karim", family: "Adel" },
          ar: { given: "كريم", family: "عادل" },
        },
        phone: "0100 555 0808",
      },
      flags,
    });
    const link = (await api.people.student({ id: studentId })).guardians?.find(
      (guardian) => guardian.fullNameEn === "Karim Adel",
    );
    if (!link) throw new Error("link missing");
    await api.people.saveSignIn({
      userId: link.userId,
      loginName: "karim.adel@example.com",
      password,
    });
    expect(
      await rejection(
        client("northwind").identity.signIn({
          loginName: "karim.adel@example.com",
          password,
        }),
      ),
    ).toMatchObject({ message: "auth.invalid_credentials" });
    await api.people.saveRelationship({
      studentId,
      relationshipId: link.relationshipId,
      expectedVersion: link.version,
      flags: { ...flags, portalAccess: true },
    });
    const session = await client("northwind").identity.signIn({
      loginName: "karim.adel@example.com",
      password,
    });
    expect(
      (await client("northwind", session.token).identity.currentUser()).id,
    ).toBe(link.userId);
  });

  test("a principal signs in to their school and lands in the admin workspace", async () => {
    const principal = login("principal");
    const api = client("northwind");
    const session = await api.identity.signIn({
      loginName: principal,
      password: SEED_PASSWORD,
    });
    expect(session.workspace).toBe("admin");
    const me = await client("northwind", session.token).identity.currentUser();
    expect(me.profile).toBe("staff_admin");
    expect(me.capabilities).toContain("people:manage");
    expect(me.school.slug).toBe("northwind");
  });

  test("a wrong password, an unknown login and another tenant's school all read the same", async () => {
    const api = client("northwind");
    const principal = login("principal");
    const attempts = [
      () =>
        api.identity.signIn({
          loginName: principal,
          password: "not the password",
        }),
      () =>
        api.identity.signIn({
          loginName: "nobody@example.com",
          password: SEED_PASSWORD,
        }),
      () =>
        client("acme").identity.signIn({
          loginName: principal,
          password: SEED_PASSWORD,
        }),
    ];
    for (const attempt of attempts)
      expect(await rejection(attempt())).toMatchObject({
        message: "auth.invalid_credentials",
      });
  });

  test("a session cannot be used at a school of another tenant", async () => {
    const session = await client("northwind").identity.signIn({
      loginName: login("teacher"),
      password: SEED_PASSWORD,
    });
    expect(
      await rejection(client("acme", session.token).identity.currentUser()),
    ).toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("the group administrator signs in at either school of the group", async () => {
    const admin = login("district_administrator");
    for (const school of ["northwind", "northwind-east"]) {
      const api = await signedIn(school, admin);
      const me = await api.identity.currentUser();
      expect(me.profile).toBe("staff_admin");
      expect(me.school.slug).toBe(school);
    }
  });

  test("a teacher of one school cannot sign in at a school where they hold no role", async () => {
    const teacher = seeded().tenants[0]?.logins.find(
      (entry) =>
        entry.role === "teacher" && entry.loginName.includes("northwind-east"),
    );
    if (!teacher) throw new Error("no northwind-east teacher");
    expect(
      await rejection(
        client("northwind").identity.signIn({
          loginName: teacher.loginName,
          password: SEED_PASSWORD,
        }),
      ),
    ).toMatchObject({ message: "auth.invalid_credentials" });
  });

  test("signing out ends the session", async () => {
    const session = await client("northwind").identity.signIn({
      loginName: login("parent"),
      password: SEED_PASSWORD,
    });
    const api = client("northwind", session.token);
    expect((await api.identity.currentUser()).workspace).toBe("family");
    await api.identity.signOut();
    expect(await rejection(api.identity.currentUser())).toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("a person's own password", () => {
  test("is changed with the old one, which signs their other devices out and keeps this one in", async () => {
    const office = await signedIn("northwind", login("principal"));
    const loginName = "salama.own@northwind.example.com";
    const old = "correct horse battery staple";
    const { id } = await office.people.saveStaff({
      names: {
        en: { given: "Salama", family: "Ashoush" },
        ar: { given: "سلامة", family: "عشوش" },
      },
      email: loginName,
      roles: ["teacher"],
    });
    await office.people.saveSignIn({ userId: id, loginName, password: old });
    const signIn = async (password: string) =>
      client(
        "northwind",
        (await client("northwind").identity.signIn({ loginName, password }))
          .token,
      );
    const here = await signIn(old);
    const elsewhere = await signIn(old);

    expect(
      await rejection(
        here.identity.changePassword({
          current: "not the password",
          password: "a new phrase to sign in with",
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST", message: "auth.wrong_password" });
    expect(
      await rejection(
        here.identity.changePassword({ current: old, password: "too short" }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
    expect((await elsewhere.identity.currentUser()).id).toBe(id);

    const fresh = "a new phrase to sign in with";
    expect(
      await here.identity.changePassword({ current: old, password: fresh }),
    ).toEqual({ changed: true });
    expect((await here.identity.currentUser()).id).toBe(id);
    expect(await rejection(elsewhere.identity.currentUser())).toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(
      await rejection(
        client("northwind").identity.signIn({ loginName, password: old }),
      ),
    ).toMatchObject({ message: "auth.invalid_credentials" });
    expect((await (await signIn(fresh)).identity.currentUser()).id).toBe(id);
  });

  test("stops being asked for after too many wrong tries", async () => {
    const office = await signedIn("northwind", login("principal"));
    const loginName = "salama.tries@northwind.example.com";
    const password = "correct horse battery staple";
    const { id } = await office.people.saveStaff({
      names: {
        en: { given: "Salama", family: "Nabil" },
        ar: { given: "سلامة", family: "نبيل" },
      },
      email: loginName,
      roles: ["teacher"],
    });
    await office.people.saveSignIn({ userId: id, loginName, password });
    const session = await client("northwind").identity.signIn({
      loginName,
      password,
    });
    const api = client("northwind", session.token);
    const wrong = () =>
      rejection(
        api.identity.changePassword({
          current: "not the password",
          password: "a new phrase to sign in with",
        }),
      );
    const tries: unknown[] = [];
    for (let attempt = 0; attempt < 10; attempt += 1) tries.push(await wrong());
    expect(tries.at(-1)).toMatchObject({ message: "auth.wrong_password" });
    // The right password is refused as well until the window passes.
    expect(
      await rejection(
        api.identity.changePassword({
          current: password,
          password: "a new phrase to sign in with",
        }),
      ),
    ).toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: "auth.too_many_attempts",
    });
  });
});

// Each sign-in hashes a password, which is slow on shared CI machines.
describe("sign-in from one network", () => {
  test("a whole school signing in from one address is never held back", async () => {
    const api = client("northwind", undefined, "en", {
      "x-forwarded-for": "203.0.113.20",
    });
    const principal = login("principal");
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const session = await api.identity.signIn({
        loginName: principal,
        password: SEED_PASSWORD,
      });
      expect(session.token).toBeString();
    }
  }, 30_000);

  test("failures from one network refuse even the right password", async () => {
    const api = client("northwind", undefined, "en", {
      "x-forwarded-for": "198.51.100.30",
    });
    for (let attempt = 0; attempt < 50; attempt += 1)
      expect(
        await rejection(
          api.identity.signIn({
            loginName: `nobody${attempt}@northwind.example.com`,
            password: "not anybody's password",
          }),
        ),
      ).toMatchObject({ message: "auth.invalid_credentials" });
    expect(
      await rejection(
        api.identity.signIn({
          loginName: login("principal"),
          password: SEED_PASSWORD,
        }),
      ),
    ).toMatchObject({ message: "auth.too_many_attempts" });
  }, 30_000);
});
