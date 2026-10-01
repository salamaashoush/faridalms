import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  baseConstraints,
  ck,
  core,
  entityColumns,
  entityProfile,
  fk,
  pk,
  tenantColumns,
} from "./conventions";
import { orgs, tenants } from "./tenancy";

/**
 * An exam board of the school's own, for exams the platform does not keep
 * sessions for: its own mocks, a national exam, a board not listed.
 */
export const examBoards = core.table.withRLS(
  "exam_boards",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    titleEn: text("title_en"),
    titleAr: text("title_ar"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("exam_boards", t.tenantId, t.id),
    ...baseConstraints("exam_boards", t, tenants),
    fk("exam_boards", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    ck("exam_boards", "title_en", sql`char_length(title_en) between 1 and 120`),
    ck("exam_boards", "title_ar", sql`char_length(title_ar) between 1 and 120`),
    ck("exam_boards", "title", sql`num_nonnulls(title_en, title_ar) >= 1`),
    index("exam_boards_org_idx")
      .on(t.tenantId, t.orgId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * An exam session a school enters coursework for: one of the platform's
 * official sessions, named by its directory id, or one of the school's own
 * boards. An official session with no keep-until date of its own follows
 * the board's, so a date the operators correct reaches every school that
 * kept the default.
 */
export const examSessions = core.table.withRLS(
  "exam_sessions",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    officialSeries: text("official_series"),
    boardId: uuid("board_id"),
    titleEn: text("title_en"),
    titleAr: text("title_ar"),
    /** The first day of the month the session sits in. */
    sitsIn: date("sits_in", { mode: "string" }).notNull(),
    keepUntil: date("keep_until", { mode: "string" }),
    declarationRequired: boolean("declaration_required")
      .notNull()
      .default(true),
    aiEvidenceRequired: boolean("ai_evidence_required").notNull().default(true),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("exam_sessions", t.tenantId, t.id),
    ...baseConstraints("exam_sessions", t, tenants),
    fk("exam_sessions", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "exam_sessions",
      [t.tenantId, t.boardId],
      [examBoards.tenantId, examBoards.id],
    ),
    ck(
      "exam_sessions",
      "board",
      sql`num_nonnulls(official_series, board_id) = 1`,
    ),
    ck(
      "exam_sessions",
      "official_series",
      sql`official_series ~ '^[a-z0-9][a-z0-9-]{2,62}$'`,
    ),
    ck(
      "exam_sessions",
      "title_en",
      sql`char_length(title_en) between 1 and 120`,
    ),
    ck(
      "exam_sessions",
      "title_ar",
      sql`char_length(title_ar) between 1 and 120`,
    ),
    ck(
      "exam_sessions",
      "title",
      sql`official_series is not null or num_nonnulls(title_en, title_ar) >= 1`,
    ),
    ck("exam_sessions", "sits_in", sql`extract(day from sits_in) = 1`),
    ck(
      "exam_sessions",
      "keep_until",
      sql`(official_series is not null or keep_until is not null) and (keep_until is null or keep_until > sits_in)`,
    ),
    uniqueIndex("exam_sessions_official_key")
      .on(t.tenantId, t.orgId, t.officialSeries)
      .where(sql`status = 'active' and official_series is not null`),
    index("exam_sessions_org_idx")
      .on(t.tenantId, t.orgId, t.sitsIn)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
