import type { Browser, Page } from "@playwright/test";

import { SWITCHED_MODULES } from "@faridalms/domain/modules";
import { expect } from "@playwright/test";
import { execFileSync } from "node:child_process";

import type { Api } from "./api";

import { signedInApi } from "./api";
import { names } from "./school";
import { PASSWORD, portal, signInWith } from "./sign-in";

export interface FreshSchool {
  slug: string;
  admin: string;
  teacher: string;
  guardian: string;
  student: string;
}

/**
 * A school exactly as production creates one, through the server shell's
 * `create-school` with every module: nothing but its first administrator,
 * no school year, no classes. The shell prints the welcome email instead
 * of sending it, so the link is read from what it prints.
 */
function createSchool(slug: string) {
  const printed = execFileSync(
    "bun",
    [
      "apps/api/src/admin.ts",
      "create-school",
      "--slug",
      slug,
      "--name",
      `Salama Academy ${slug}`,
      "--name-ar",
      "أكاديمية سلامة",
      "--admin-email",
      `salama@${slug}.example.com`,
      "--admin-name",
      "Salama Ashoush",
      "--admin-name-ar",
      "سلامة عشوش",
      "--country",
      "EG",
      "--time-zone",
      "Africa/Cairo",
      "--modules",
      "all",
      "--print-link",
    ],
    {
      env: {
        ...process.env,
        DIRECTORY_ADMIN_URL: process.env.OPS_DIRECTORY_URL,
      },
      encoding: "utf8",
    },
  );
  const secret = /\/welcome#(\S+)/.exec(printed)?.[1];
  if (!secret) throw new Error(`no welcome link in:\n${printed}`);
  return secret;
}

/** Chooses a password from the welcome link, as the first administrator does. */
async function welcome(browser: Browser, slug: string, secret: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${portal(slug)}/welcome#${secret}`);
  await page.getByLabel("New password").fill(PASSWORD);
  await page.getByLabel("Type it again").fill(PASSWORD);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Password saved" }),
  ).toBeVisible();
  await context.close();
}

/**
 * Every module the school switches on itself, so each of its pages is
 * walked; a teacher, a student and their mother, each with a password,
 * placed nowhere.
 */
async function firstPeople(admin: Api, slug: string) {
  for (const feature of SWITCHED_MODULES)
    await admin.school.setFeature({ feature, enabled: true });
  const teacher = `teacher@${slug}.example.com`;
  const staff = await admin.people.saveStaff({
    names: names("Salama", "Teacher"),
    email: teacher,
    roles: ["teacher"],
  });
  await admin.people.saveSignIn({
    userId: staff.id,
    loginName: teacher,
    password: PASSWORD,
  });
  const options = await admin.people.options();
  const mother = options.relations.find((row) => row.code === "mother");
  if (!mother) throw new Error("the school has no mother relation");
  const saved = await admin.people.saveStudent({
    names: names("Salama", "Pupil"),
    reference: `SA-${slug}`,
    guardians: [
      {
        person: {
          names: names("Mona", "Pupil"),
          phone: `010${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
        },
        flags: {
          relationId: mother.id,
          legalGuardian: true,
          portalAccess: true,
          receivesNotifications: true,
          primaryContact: true,
          emergencyContact: true,
          residence: "primary",
          pickup: "allowed",
        },
      },
    ],
  });
  const student = `pupil@${slug}.example.com`;
  await admin.people.saveSignIn({
    userId: saved.id,
    loginName: student,
    password: PASSWORD,
  });
  const record = await admin.people.student({ id: saved.id });
  const parent = record.guardians?.[0];
  if (!parent) throw new Error("the student has no guardian");
  const guardian = `mona@${slug}.example.com`;
  await admin.people.saveSignIn({
    userId: parent.userId,
    loginName: guardian,
    password: PASSWORD,
  });
  return { teacher, guardian, student };
}

/**
 * A newly created school with no school year, its first administrator
 * signed up, and one teacher, student and guardian who can sign in.
 */
export async function freshSchool(browser: Browser): Promise<FreshSchool> {
  const slug = `fresh-${crypto.randomUUID().slice(0, 8)}`;
  const secret = createSchool(slug);
  await welcome(browser, slug, secret);
  const admin = `salama@${slug}.example.com`;
  const { api } = await signedInApi(admin, PASSWORD, slug);
  return { slug, admin, ...(await firstPeople(api, slug)) };
}

/** Signs in to the fresh school and waits for the person's home. */
export async function signInTo(
  page: Page,
  school: FreshSchool,
  who: "admin" | "teacher" | "guardian" | "student",
) {
  const home = {
    admin: "/today",
    teacher: "/today",
    guardian: "/family",
    student: "/me",
  };
  await signInWith(page, school[who], PASSWORD, home[who], school.slug);
}
