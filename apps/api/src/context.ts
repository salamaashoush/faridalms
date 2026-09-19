import type { Database } from "@faridalms/database";
import type { ControlDatabase } from "@faridalms/database/control";
import type { schools } from "@faridalms/database/control-schema";

import type { SessionUser } from "./authorization";
import type { FileScanner } from "./files/scan";
import type { FileStore } from "./files/store";
import type { TenantPools } from "./tenancy";

export interface ApiContext {
  control: ControlDatabase;
  pools: TenantPools;
  files: FileStore;
  scanner: FileScanner | null;
  maxUploadBytes: number;
  headers: Headers;
  requestId: string;
}

export interface SchoolContext extends ApiContext {
  db: Database;
  school: typeof schools.$inferSelect;
  user: SessionUser;
  today: string;
  sessionHash: string;
}
