import type { DirectoryTenantState } from "@faridalms/database/directory/schema";
import type { AgingBucket, DunningStep } from "@faridalms/domain/dunning";
import type { ExamBoard } from "@faridalms/domain/exams";
import type { HostRole, HostState } from "@faridalms/domain/hosts";
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
import type {
  HealthLevel,
  HealthReason,
  OnboardingItem,
} from "@faridalms/domain/onboarding";
import type { OperatorRole } from "@faridalms/domain/operators";
import type { SchoolNotice } from "@faridalms/domain/plans";
import type { DemoRole, DemoSize } from "@faridalms/domain/product";
import type { SchoolStanding } from "@faridalms/domain/provisioning";
import type { DraftStep } from "@faridalms/domain/provisioning-draft";
import type { QuoteState } from "@faridalms/domain/quotes";
import type {
  Currency,
  LimitKey,
  SubscriptionState,
} from "@faridalms/domain/subscriptions";
import type { Tone } from "@faridalms/ui/system/status";

import {
  formatDayIn,
  formatInstantIn,
  formatMonthIn,
} from "@faridalms/domain/date-text";
import { HOST_ROLES } from "@faridalms/domain/hosts";
import { MODULE_IDS } from "@faridalms/domain/modules";
import {
  BUSINESS_TIME_ZONE,
  STORAGE_KEYS,
} from "@faridalms/domain/subscriptions";

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

/** An instant on the business's clock: "Nov 6, 2026, 10:11 PM". */
export function formatWhen(when: string | Date): string {
  return formatInstantIn(when, "medium", BUSINESS_TIME_ZONE, "en");
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

/** What each module gives a school, in a line, for an operator deciding what to sell. */
export const MODULE_HINTS: Record<ModuleId, string> = {
  coursework: "Assignments handed in, marked and returned",
  peer_review: "Students review each other's work against a rubric",
  gradebook: "Marks and grades by class, term and subject",
  attendance: "Registers, absence reports, follow-up and the front desk",
  timetable: "Each class's week of lessons, and cover for absent teachers",
  news: "Announcements and news posts to the school's community",
  website: "The school's public website and its pages",
  custom_domains: "The website and portal on the school's own domain",
  admissions: "Enquiries, applications and offers for new students",
  student_records: "Each student's full record beyond their profile",
  badges: "Young children sign in by showing a printed badge",
  standards: "Curriculum standards that work and marks are tagged with",
  exams: "Exam entries and sessions with external boards",
  elearning: "Self-paced courses and lessons students work through",
  early_years: "Observations and learning journeys for the early years",
  coding: "Block and text coding projects that run in the browser",
  video: "Uploaded and streamed video with captions",
  integrations: "Tools from other providers launched inside lessons (LTI)",
  sso: "Sign in through the school's own identity provider",
  sms: "Text messages to families",
};

/** A module's name, or the id itself for one the catalogue no longer has, as an old change may name. */
export function moduleName(id: string): string {
  const known = MODULE_IDS.find((module) => module === id);
  return known ? MODULE_NAMES[known] : id;
}

export const BOARD_NAMES: Record<ExamBoard, string> = {
  cambridge: "Cambridge International",
  pearson: "Pearson Edexcel",
  ib: "International Baccalaureate",
  jcq: "UK boards (JCQ: AQA, OCR, WJEC)",
};

/** A month with its year: "September 2026". */
export function formatMonth(isoDate: string): string {
  return formatMonthIn(isoDate, "label", "en");
}

/** An official exam session as people name it: "Cambridge International, June 2027". */
export function seriesName(series: { board: ExamBoard; sitsIn: string }) {
  return `${BOARD_NAMES[series.board]}, ${formatMonth(series.sitsIn)}`;
}

/** An instant's day on the business's clock: "Nov 7, 2026". */
export function formatWhenDay(when: string | Date): string {
  return formatInstantIn(when, "date", BUSINESS_TIME_ZONE, "en");
}

const REGIONS = new Intl.DisplayNames(["en"], { type: "region" });

/** A country's English name from its two-letter code, or the code where it names none. */
export function formatCountry(code: string): string {
  try {
    return REGIONS.of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Codes the region names know that are not countries anyone is invoiced
 * in: groupings, test regions, and retired codes that name a country
 * already listed under its current one (UK for GB, ZR for CD).
 */
const NOT_COUNTRIES = new Set(
  "EU EZ QO UN XA XB ZZ AN BU CS DD DY FX HV NH RH SU TP UK VD YD YU ZR".split(
    " ",
  ),
);

/**
 * Every country by its English name with its two-letter code as the value,
 * for a field that picks one: every pair of letters the region names know.
 */
export const COUNTRY_OPTIONS: readonly { value: string; label: string }[] =
  (() => {
    const names = new Intl.DisplayNames(["en"], {
      type: "region",
      fallback: "none",
    });
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    return letters
      .flatMap((first) =>
        letters.flatMap((second) => {
          const code = first + second;
          let name: string | undefined;
          try {
            name = names.of(code);
          } catch {
            name = undefined;
          }
          return name && name !== code && !NOT_COUNTRIES.has(code)
            ? [{ value: code, label: name }]
            : [];
        }),
      )
      .toSorted((a, b) => a.label.localeCompare(b.label, "en"));
  })();

/** An instant's day on the business's clock, without its year: "Nov 7". */
export function formatShortWhen(when: string | Date): string {
  return formatInstantIn(when, "short", BUSINESS_TIME_ZONE, "en");
}

/** A calendar day: "Sep 14, 2026". */
export function formatDay(isoDate: string): string {
  return formatDayIn(isoDate, "medium", "en");
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

/**
 * An amount without its currency, for a column of one row's amounts whose
 * total names the currency once.
 */
export function formatAmount(minor: number, currency: Currency): string {
  const { minimumFractionDigits } = new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).resolvedOptions();
  return new Intl.NumberFormat("en", {
    minimumFractionDigits,
    maximumFractionDigits: minimumFractionDigits,
  }).format(minor / 100);
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

export const SUBSCRIPTION_STATE_NAMES: Record<SubscriptionState, string> = {
  trial: "Trial",
  active: "Active",
  ended: "Ended",
};

export const SUBSCRIPTION_STATE_TONE: Record<SubscriptionState, Tone> = {
  trial: "info",
  active: "success",
  ended: "neutral",
};

export const LEAD_STATE_TONE: Record<LeadState, Tone> = {
  new: "info",
  contacted: "info",
  demo_booked: "info",
  demo_done: "info",
  proposal: "warning",
  won: "success",
  lost: "neutral",
};

export const QUOTE_STATE_TONE: Record<QuoteState, Tone> = {
  draft: "neutral",
  sent: "info",
  accepted: "success",
  superseded: "neutral",
};

export const INVOICE_STATE_TONE: Record<InvoiceState, Tone> = {
  draft: "neutral",
  issued: "info",
  partly_paid: "warning",
  paid: "success",
  credited: "neutral",
};

/**
 * An invoice's status as finance reads it: its state, except that an
 * invoice still owing past its due day is Overdue, so each invoice has one
 * status and a list's counts by status add up.
 */
export const INVOICE_STANDINGS = [
  "draft",
  "issued",
  "partly_paid",
  "overdue",
  "paid",
  "credited",
] as const;
export type InvoiceStanding = (typeof INVOICE_STANDINGS)[number];

export const INVOICE_STANDING_NAMES: Record<InvoiceStanding, string> = {
  ...INVOICE_STATE_NAMES,
  overdue: "Overdue",
};

export const INVOICE_STANDING_TONE: Record<InvoiceStanding, Tone> = {
  ...INVOICE_STATE_TONE,
  overdue: "danger",
};

interface StandingFacts {
  state: InvoiceState;
  dueOn: string | null;
  owedMinor: number;
}

export function standingOf(
  invoice: StandingFacts,
  today: string,
): InvoiceStanding {
  const open = invoice.state === "issued" || invoice.state === "partly_paid";
  return open &&
    invoice.owedMinor > 0 &&
    invoice.dueOn !== null &&
    invoice.dueOn < today
    ? "overdue"
    : invoice.state;
}

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

export const STANDING_TONE: Record<SchoolStanding, Tone> = {
  full: "success",
  restricted: "warning",
  read_only: "warning",
  suspended: "danger",
};

export const ONBOARDING_ITEM_NAMES: Record<OnboardingItem, string> = {
  admin_signed_in: "An administrator signed in",
  school_details: "Logo and address set",
  year_ready: "The year and its terms exist",
  classes: "Classes exist",
  staff_invited: "Staff added",
  staff_signed_in: "A teacher signed in",
  students_imported: "Students added",
  guardians_linked: "Guardians linked",
  families_signed_in: "A family signed in",
  first_assignment: "First assignment published",
  first_register: "First register taken",
  website_published: "Website published",
  custom_domain: "Own address active",
  first_invoice_paid: "First invoice paid",
  kickoff_call: "Kick-off call",
  training: "Training session",
  data_import: "Data import done",
};

export const HEALTH_LEVEL_NAMES: Record<HealthLevel, string> = {
  green: "Healthy",
  amber: "Watch",
  red: "Needs help",
};

export const HEALTH_REASON_NAMES: Record<HealthReason, string> = {
  quiet_in_term: "Nobody signed in through a week of school",
  invoice_overdue: "An invoice is over 30 days overdue",
  onboarding_stalled: "Onboarding has stalled",
  host_failing: "One of its own addresses is failing",
  deliveries_failing: "Messages failed to deliver in the last day",
};

/** What each operator role is called, and what it may do. */
export const OPERATOR_ROLE_NAMES: Record<OperatorRole, string> = {
  owner: "Owner",
  sales: "Sales",
  support: "Support",
  finance: "Finance",
};

export const OPERATOR_ROLE_HINTS: Record<OperatorRole, string> = {
  owner: "Everything, including operators and the catalogue.",
  sales: "Leads, quotes and customers; reads schools.",
  support: "Schools, support requests and notices; reads billing.",
  finance: "Invoices, payments, credit notes and reports.",
};

export const TENANT_STATE_NAMES: Record<DirectoryTenantState, string> = {
  provisioning: "Provisioning",
  importing: "Importing",
  active: "Active",
  read_only: "Paused (read only)",
  frozen: "Frozen",
  suspended: "Suspended",
  offboarding: "Offboarding",
  offboarded: "Offboarded",
};

export const TENANT_STATE_TONE: Record<DirectoryTenantState, Tone> = {
  provisioning: "info",
  importing: "info",
  active: "success",
  read_only: "warning",
  frozen: "warning",
  suspended: "danger",
  offboarding: "neutral",
  offboarded: "neutral",
};

export const HOST_ROLE_NAMES: Record<HostRole, string> = {
  site: "Website",
  portal: "Portal",
};

export const HOST_ROLE_OPTIONS = HOST_ROLES.map((role) => ({
  value: role,
  label: HOST_ROLE_NAMES[role],
}));

export const HOST_STATE_NAMES: Record<HostState, string> = {
  pending: "Pending",
  verified: "Verified, waiting for its certificate",
  active: "Active",
  failing: "Failing: not routed",
  removed: "Removed",
};

export const HOST_STATE_TONE: Record<HostState, Tone> = {
  pending: "neutral",
  verified: "info",
  active: "success",
  failing: "danger",
  removed: "neutral",
};

/** What each kind of directory change did, as the change log names it. */
export const CHANGE_ACTION_NAMES: Record<string, string> = {
  "tenant.create": "Created",
  "tenant.retry": "Creation retried",
  "tenant.activate": "Activated",
  "tenant.lifecycle": "State changed",
  "entitlements.update": "Entitlements changed",
  "onboarding.done": "Onboarding step done",
  "onboarding.undone": "Onboarding step reopened",
  "sso_domain.add": "Sign-in domain added",
  "administrator.invite": "Administrator sent a new link",
  "series.create": "Session added",
  "series.update": "Session changed",
  "host.add": "Host added",
  "host.remove": "Host removed",
  "host.canonical": "Main host changed",
  "host.pending": "Host waiting for its records",
  "host.verified": "Host verified",
  "host.active": "Host went live",
  "host.failing": "Host stopped routing",
  "host.removed": "Host dropped after failing",
};

/** Onboarding steps that belong together, in the order a school takes them. */
export interface OnboardingPhase {
  title: string;
  items: readonly OnboardingItem[];
}

export const ONBOARDING_PHASES: readonly OnboardingPhase[] = [
  {
    title: "Getting started",
    items: [
      "kickoff_call",
      "admin_signed_in",
      "school_details",
      "year_ready",
      "classes",
      "data_import",
    ],
  },
  {
    title: "People",
    items: [
      "staff_invited",
      "staff_signed_in",
      "students_imported",
      "guardians_linked",
      "families_signed_in",
      "training",
    ],
  },
  {
    title: "Going live",
    items: [
      "first_assignment",
      "first_register",
      "website_published",
      "custom_domain",
      "first_invoice_paid",
    ],
  },
];

/** Modules that serve one part of school life. */
export interface ModuleGroup {
  title: string;
  modules: readonly ModuleId[];
}

/** The modules as an operator reads them: grouped by the part of school life they serve. */
export const MODULE_GROUPS: readonly ModuleGroup[] = [
  {
    title: "Teaching and learning",
    modules: [
      "coursework",
      "peer_review",
      "gradebook",
      "standards",
      "exams",
      "elearning",
      "early_years",
      "coding",
      "video",
      "badges",
    ],
  },
  {
    title: "School office",
    modules: ["attendance", "timetable", "student_records", "admissions"],
  },
  {
    title: "Communication and website",
    modules: ["news", "website", "custom_domains", "sms"],
  },
  { title: "Connections", modules: ["integrations", "sso"] },
];
