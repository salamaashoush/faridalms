import type { ExamBoard } from "@faridalms/domain/exams";
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
import { descriptors } from "./descriptors";
import { gradeScales } from "./grading";
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

/**
 * A programme a school runs, such as the IB Diploma or IGCSE: the grade
 * levels it covers, the scale its classes grade on and the board its
 * coursework usually counts for. Two can share a grade level.
 */
export const programmes = core.table.withRLS(
  "programmes",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    titleEn: text("title_en"),
    titleAr: text("title_ar"),
    gradeScaleId: uuid("grade_scale_id"),
    officialBoard: text("official_board").$type<ExamBoard>(),
    boardId: uuid("board_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("programmes", t.tenantId, t.id),
    ...baseConstraints("programmes", t, tenants),
    fk("programmes", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "programmes",
      [t.tenantId, t.gradeScaleId],
      [gradeScales.tenantId, gradeScales.id],
    ),
    fk(
      "programmes",
      [t.tenantId, t.boardId],
      [examBoards.tenantId, examBoards.id],
    ),
    ck(
      "programmes",
      "official_board",
      sql`official_board in ('cambridge', 'pearson', 'ib', 'jcq')`,
    ),
    ck("programmes", "board", sql`num_nonnulls(official_board, board_id) <= 1`),
    ck("programmes", "title_en", sql`char_length(title_en) between 1 and 120`),
    ck("programmes", "title_ar", sql`char_length(title_ar) between 1 and 120`),
    ck("programmes", "title", sql`num_nonnulls(title_en, title_ar) >= 1`),
    index("programmes_org_idx")
      .on(t.tenantId, t.orgId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

export const programmeGradeLevels = core.table.withRLS(
  "programme_grade_levels",
  {
    ...tenantColumns(),
    programmeId: uuid("programme_id").notNull(),
    gradeLevelDescriptorId: uuid("grade_level_descriptor_id").notNull(),
    gradeLevelNs: text("grade_level_ns")
      .notNull()
      .generatedAlwaysAs(sql`'grade_level'`),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("programme_grade_levels", t.tenantId, t.id),
    ...baseConstraints("programme_grade_levels", t, tenants),
    fk(
      "programme_grade_levels",
      [t.tenantId, t.programmeId],
      [programmes.tenantId, programmes.id],
    ),
    fk(
      "programme_grade_levels",
      [t.tenantId, t.gradeLevelDescriptorId, t.gradeLevelNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    uniqueIndex("programme_grade_levels_key")
      .on(t.tenantId, t.programmeId, t.gradeLevelDescriptorId)
      .where(sql`status = 'active'`),
    index("programme_grade_levels_level_idx")
      .on(t.tenantId, t.gradeLevelDescriptorId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
