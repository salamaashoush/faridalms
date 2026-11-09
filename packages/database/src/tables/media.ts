import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { index, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
import { files } from "./files";
import { users } from "./people";
import { orgs, tenants } from "./tenancy";

/**
 * The words a school files its media under. A tag belongs to one
 * school; its name is unique there whatever its case.
 */
export const mediaTags = core.table.withRLS(
  "media_tags",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    name: text("name").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("media_tags", t.tenantId, t.id),
    ...baseConstraints("media_tags", t, tenants),
    fk("media_tags", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    ck(
      "media_tags",
      "name",
      sql`char_length(name) between 1 and 40 and name = btrim(name)`,
    ),
    uniqueIndex("media_tags_name_key")
      .on(t.tenantId, t.orgId, sql`lower(${t.name})`)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/** A media item filed under a tag, and who filed it there. */
export const mediaItemTags = core.table.withRLS(
  "media_item_tags",
  {
    ...tenantColumns(),
    fileId: uuid("file_id").notNull(),
    tagId: uuid("tag_id").notNull(),
    taggedByUserId: uuid("tagged_by_user_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("media_item_tags", t.tenantId, t.id),
    ...baseConstraints("media_item_tags", t, tenants),
    fk("media_item_tags", [t.tenantId, t.fileId], [files.tenantId, files.id]),
    fk(
      "media_item_tags",
      [t.tenantId, t.tagId],
      [mediaTags.tenantId, mediaTags.id],
    ),
    fk(
      "media_item_tags",
      [t.tenantId, t.taggedByUserId],
      [users.tenantId, users.id],
    ),
    uniqueIndex("media_item_tags_key")
      .on(t.tenantId, t.fileId, t.tagId)
      .where(sql`status = 'active'`),
    index("media_item_tags_tag_idx")
      .on(t.tenantId, t.tagId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * What a media item is called and says under itself where it is shown,
 * apart from its file's name: a title for people rather than for disks,
 * and a caption a picture block starts from.
 */
export const mediaItemTexts = core.table.withRLS(
  "media_item_texts",
  {
    ...tenantColumns(),
    fileId: uuid("file_id").notNull(),
    title: text("title"),
    caption: text("caption"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("media_item_texts", t.tenantId, t.id),
    ...baseConstraints("media_item_texts", t, tenants),
    fk("media_item_texts", [t.tenantId, t.fileId], [files.tenantId, files.id]),
    ck("media_item_texts", "title", sql`char_length(title) between 1 and 200`),
    ck(
      "media_item_texts",
      "caption",
      sql`char_length(caption) between 1 and 500`,
    ),
    uniqueIndex("media_item_texts_file_key")
      .on(t.tenantId, t.fileId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
