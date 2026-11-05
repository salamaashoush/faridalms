import type { AgingBucket, DunningStep } from "@faridalms/domain/dunning";
import type {
  InvoiceKind,
  InvoiceState,
  PaymentMethod,
} from "@faridalms/domain/invoices";
import type {
  ActivityKind,
  LeadSource,
  LeadState,
  LostReason,
} from "@faridalms/domain/leads";
import type { ModuleId } from "@faridalms/domain/modules";
import type { SchoolNotice } from "@faridalms/domain/plans";
import type { DemoRole, DemoSize } from "@faridalms/domain/product";
import type { SchoolStanding } from "@faridalms/domain/provisioning";
import type { DraftStep } from "@faridalms/domain/provisioning-draft";
import type { QuoteState } from "@faridalms/domain/quotes";
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

export const LEAD_STATE_NAMES: Record<LeadState, string> = {
  new: "New",
  contacted: "Contacted",
  demo_booked: "Demo booked",
  demo_done: "Demo done",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};

export const LOST_REASON_NAMES: Record<LostReason, string> = {
  price: "Price",
  timing: "Timing",
  competitor: "Chose a competitor",
  no_response: "No response",
  not_fit: "Not a fit",
};

export const LEAD_SOURCE_NAMES: Record<LeadSource, string> = {
  demo_form: "Demo form",
  module_interest: "Asked about a module",
  manual: "Entered by hand",
};

export const ACTIVITY_NAMES: Record<ActivityKind, string> = {
  call: "Call",
  meeting: "Meeting",
  email: "Email",
  note: "Note",
};

export const SIZE_NAMES: Record<DemoSize, string> = {
  under_200: "Fewer than 200 students",
  "200_1000": "200 to 1,000 students",
  over_1000: "More than 1,000 students",
};

export const ROLE_NAMES: Record<DemoRole, string> = {
  leader: "School leader",
  teacher: "Teacher",
  it: "IT",
  parent: "Parent",
  other: "Other",
};

export const QUOTE_STATE_NAMES: Record<QuoteState, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  superseded: "Superseded",
};

export const INVOICE_STATE_NAMES: Record<InvoiceState, string> = {
  draft: "Draft",
  issued: "Issued",
  partly_paid: "Partly paid",
  paid: "Paid",
  credited: "Credited",
};

export const INVOICE_KIND_NAMES: Record<InvoiceKind, string> = {
  instalment: "Instalment",
  proration: "Started in the term",
  true_up: "Census true-up",
  manual: "By hand",
};

export const PAYMENT_METHOD_NAMES: Record<PaymentMethod, string> = {
  bank_transfer: "Bank transfer",
  card: "Card",
  instapay: "InstaPay",
  cheque: "Cheque",
  withholding_certificate: "Withholding certificate",
};

export const DUNNING_STEP_NAMES: Record<DunningStep, string> = {
  upcoming: "Due in a week",
  due: "Due today",
  overdue_7: "7 days overdue",
  overdue_14: "14 days overdue",
  restrict_notice: "Told access will be restricted",
  restricted: "Access restricted",
  read_only_notice: "Told it will become read-only",
  read_only: "Read-only",
  suspend_notice: "Told it will be suspended",
  suspended: "Suspended",
  ended: "Contract ended",
};

export const AGING_BUCKET_NAMES: Record<AgingBucket, string> = {
  current: "Not yet due",
  days_1_30: "1 to 30 days",
  days_31_60: "31 to 60 days",
  days_61_90: "61 to 90 days",
  over_90: "Over 90 days",
};

export const STANDING_NAMES: Record<SchoolStanding, string> = {
  full: "Active",
  restricted: "Restricted",
  read_only: "Paused (read only)",
  suspended: "Suspended",
};
