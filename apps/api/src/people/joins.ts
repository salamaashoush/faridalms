import type { Capability } from "@faridalms/domain/capabilities";

import type { UnitContext } from "../core/context";

import { everyContribution, point } from "../core/extension";

/**
 * What a module keeps of a person that moves to the record they are joined
 * to, when two records turn out to be one person: an applicant found to be
 * a former student, say.
 */
export interface RecordJoin {
  join(context: UnitContext, input: JoinInput): Promise<void>;
}

export interface JoinInput {
  fromUserId: string;
  toUserId: string;
  /** What lets the caller join the two, checked before anything moves. */
  by: readonly Capability[];
}

export const recordJoins = point<RecordJoin>("record joins");

/** Moves what every module keeps of one person to the other. */
export async function joinRecordsOf(
  context: UnitContext,
  input: JoinInput,
): Promise<void> {
  for (const each of everyContribution(context.extensions, recordJoins))
    await each.join(context, input);
}
