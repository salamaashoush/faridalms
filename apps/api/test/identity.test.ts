import { SEED_PASSWORD } from "@faridalms/database/seed";
import { describe, expect, test } from "bun:test";

import { client, login, rejection, seeded, signedIn } from "./harness";

describe("sign-in", () => {
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
        entry.role === "teacher" && entry.loginName.includes("east"),
    );
    if (!teacher) throw new Error("no east teacher");
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
