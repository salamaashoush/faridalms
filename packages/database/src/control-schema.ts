import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const schools = pgTable("schools", {
  id: uuid().primaryKey().defaultRandom(),
  slug: varchar({ length: 64 }).notNull().unique(),
  name: varchar({ length: 160 }).notNull(),
  databaseUrl: text("database_url").notNull(),
  timeZone: text("time_zone").notNull().default("Africa/Cairo"),
  // A school's own host for its public site, matched against the request.
  publicDomain: varchar("public_domain", { length: 253 }).unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("sessions_expiry_idx").on(table.expiresAt),
    index("sessions_user_idx").on(table.schoolId, table.userId),
  ],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    key: varchar({ length: 64 }).primaryKey(),
    count: integer().notNull().default(1),
    resetsAt: timestamp("resets_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("login_attempts_reset_idx").on(table.resetsAt)],
);
