import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { Among, Raw } from "./search";
import type { Scope } from "./students";

import { taughtClasses } from "./classes";
import { reachedBy } from "./learning";
import { liveSql } from "./publication";
import { found, snippetOf } from "./search";
import { uuidArray } from "./sql";

type Tx = CellTransaction;

export interface LearningAccess {
  tenantId: string;
  schoolId: string;
  viewerId: string;
  /** Set for those who write modules: the classes they teach and themselves as author. */
  teaching: Scope | null;
  /** The classes whose published modules the viewer may study or follow. */
  learnerClassIds: readonly string[];
  /** The students they study or follow them for: themselves, or their children. */
  learnerIds: readonly string[];
}

const moduleOpen = (access: LearningAccess, viewerId: string) => sql`(
  ${
    access.teaching
      ? sql`(m.state <> 'archived' and (m.author_user_id = ${viewerId}::uuid or exists (
          select 1 from core.module_classes x
          where x.tenant_id = m.tenant_id and x.module_id = m.id and x.status = 'active'
            and x.class_id in ${taughtClasses(access.teaching)})))`
      : sql`false`
  }
  or (${liveSql(sql`m.state`, sql`m.publish_at`)} and exists (
    select 1 from core.module_classes x
    where x.tenant_id = m.tenant_id and x.module_id = m.id and x.status = 'active'
      and x.class_id = any(${uuidArray(access.learnerClassIds)})
      and ${reachedBy(sql`x`, access.learnerIds)})))`;

/** The modules and lessons the viewer may open. */
export function learningReached(input: LearningAccess) {
  const open = moduleOpen(input, input.viewerId);
  return sql`(select m.id from core.learning_modules m
    where m.tenant_id = ${input.tenantId}::uuid and m.org_id = ${input.schoolId}::uuid
      and m.status = 'active' and ${open}
    union all
    select l.id from core.lessons l
    join core.learning_modules m on m.tenant_id = l.tenant_id and m.id = l.module_id
      and m.status = 'active' and m.org_id = ${input.schoolId}::uuid
    where l.tenant_id = ${input.tenantId}::uuid and l.status = 'active' and ${open})`;
}

/** Modules and lessons among `ids` the viewer may open. */
export async function learningAmong(tx: Tx, input: Among & LearningAccess) {
  const open = moduleOpen(input, input.viewerId);
  return found(
    await tx.execute<Raw>(sql`
      select m.id, 'learning_module' as type, m.title,
        ${snippetOf(sql`m.summary`, input.q)} as snippet, null as context, null as "when",
        case when m.state = 'draft' then 'draft' end as flag, null as roles
      from core.learning_modules m
      where m.tenant_id = ${input.tenantId}::uuid and m.org_id = ${input.schoolId}::uuid
        and m.id = any(${uuidArray(input.ids)}) and m.status = 'active' and ${open}
      union all
      select l.id, 'lesson' as type, l.title, ${snippetOf(sql`d.plain_text`, input.q)} as snippet,
        m.title as context, null as "when", case when m.state = 'draft' then 'draft' end as flag, null as roles
      from core.lessons l
      join core.learning_modules m on m.tenant_id = l.tenant_id and m.id = l.module_id
        and m.status = 'active' and m.org_id = ${input.schoolId}::uuid
      left join core.documents d on d.tenant_id = l.tenant_id and d.host_type = 'lesson'
        and d.host_id = l.id and d.status = 'active' and d.translation_of_id is null
      where l.tenant_id = ${input.tenantId}::uuid and l.id = any(${uuidArray(input.ids)})
        and l.status = 'active' and ${open}`),
  );
}
