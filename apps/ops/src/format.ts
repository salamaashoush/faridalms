import type { ModuleId } from "@faridalms/domain/modules";

import { MODULE_IDS } from "@faridalms/domain/modules";

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

export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
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
