import type { Cell } from "@faridalms/database/context";
import type { Directory } from "@faridalms/database/directory/client";
import type { ModuleId } from "@faridalms/domain/modules";

import type { CodeRunner } from "../coding/run";
import type { UnitContext } from "./context";
import type { ModuleContributions } from "./extension";

/** What the process gives every module's background worker. */
export interface WorkerDependencies {
  cell: Cell;
  directory: Directory;
  cellId: string;
  channels: UnitContext["channels"];
  runners: { python: CodeRunner | null; javascript: CodeRunner };
  extensions: readonly ModuleContributions[];
}

/**
 * A module's background worker, started by the process with the rest. It
 * acts for a school only where its module, and what it `needs`, are on.
 */
export interface ModuleWorker {
  module: ModuleId;
  needs?: readonly ModuleId[];
  name: string;
  start(deps: WorkerDependencies): () => Promise<void>;
}
