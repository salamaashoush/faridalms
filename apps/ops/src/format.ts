import type { ModuleId } from "@faridalms/domain/modules";
import type { SchoolNotice } from "@faridalms/domain/plans";
import type { DraftStep } from "@faridalms/domain/provisioning-draft";
import type { Currency, LimitKey } from "@faridalms/domain/subscriptions";

import { MODULE_IDS } from "@faridalms/domain/modules";
import { STORAGE_KEYS } from "@faridalms/domain/subscriptions";

const KIB = 1024;
const units = ["bytes", "KB", "MB", "GB", "TB"] as const;

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= KIB && unit < units.length - 1) {
    value /= KIB;
    unit += 1;
  }
  const shown = unit === 0 ? value : Math.round(value * 10) / 10;
  return `${shown.toLocaleString("en")} ${units[unit]}`;
}

export function formatWhen(when: string | Date): string {
  return new Date(when).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export const MODULE_NAMES: Record<ModuleId, string> = {
  coursework: "Coursework",
  peer_review: "Peer review",
  gradebook: "Gradebook",
  attendance: "Attendance",
  timetable: "Timetable",
  news: "News",
  website: "Website",
  custom_domains: "Custom domains",
  admissions: "Admissions",
  student_records: "Student records",
  badges: "Badges",
  standards: "Standards",
  exams: "Exams",
  elearning: "E-learning",
  early_years: "Early years",
  coding: "Coding and blocks",
  video: "Video",
  integrations: "Integrations",
  sso: "Single sign-on",
  sms: "SMS",
};

/** A module's name, or the id itself for one the catalogue no longer has, as an old change may name. */
export function moduleName(id: string): string {
  const known = MODULE_IDS.find((module) => module === id);
  return known ? MODULE_NAMES[known] : id;
}

export const BOARD_NAMES: Record<string, string> = {
  cambridge: "Cambridge International",
  pearson: "Pearson Edexcel",
  ib: "International Baccalaureate",
  jcq: "UK boards (JCQ: AQA, OCR, WJEC)",
};

export function formatMonth(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDay(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  });
}

export const LIMIT_NAMES: Record<LimitKey, string> = {
  poolBytes: "School pool",
  classBytes: "Each class",
  moduleBytes: "Each module",
  personBytes: "Each person",
  students: "Students",
  staffAccounts: "Staff accounts",
  videoHours: "Video hours",
  customDomains: "Custom domains",
  emailPerMonth: "Emails a month",
  captionMinutes: "Caption minutes a year",
};

export const isStorageKey = (key: LimitKey) =>
  (STORAGE_KEYS as readonly LimitKey[]).includes(key);

export function formatLimit(key: LimitKey, value: number | null): string {
  if (value === null) return "Unlimited";
  return isStorageKey(key) ? formatBytes(value) : value.toLocaleString("en");
}

/** An amount kept in minor units (piastres, cents), shown in the currency. */
export function formatMoney(minor: number, currency: Currency): string {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(
    minor / 100,
  );
}

/** What an operator typed as money, in minor units, or null if it is not money. */
export function minorOf(typed: string): number | null {
  const amount = Number(typed.replaceAll(",", ""));
  return typed.trim() === "" || !Number.isFinite(amount) || amount < 0
    ? null
    : Math.round(amount * 100);
}

export const NOTICE_NAMES: Record<SchoolNotice, string> = {
  payment_overdue: "Payment overdue",
  plan_ends_soon: "Plan ends soon",
};

export const DRAFT_STEP_NAMES: Record<DraftStep, string> = {
  customer: "Customer",
  schools: "Schools",
  plan: "Plan",
  addresses: "Addresses",
  people: "People",
  review: "Review",
};
