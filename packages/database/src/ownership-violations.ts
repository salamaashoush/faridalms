import type { OwnershipViolations } from "./ownership";

/**
 * Keys, namespace columns and concept columns that reach a module their
 * table's owner may not, by the module reached. `bun run db:verify` fails
 * on a violation missing here and on an entry that no longer occurs, so the
 * list only shrinks; each group stays sorted.
 */
export const OWNERSHIP_VIOLATIONS: OwnershipViolations = {};
