import type { Cell, CellTransaction } from "@faridalms/database/context";
import type {
  Directory,
  DirectorySchool,
} from "@faridalms/database/directory/client";
import type { Capability, Profile } from "@faridalms/domain/capabilities";
import type { SessionContext, Workspace } from "@faridalms/domain/workspace";

import type { FileScanner } from "../files/scan";
import type { FileStore } from "../files/store";
import type { KeyRing } from "./keys";

/** Everything a request can reach, built once per process. */
export interface ApiDependencies {
  cell: Cell;
  directory: Directory;
  keys: KeyRing;
  cellId: string;
  cellSecret: Uint8Array<ArrayBuffer>;
  files: FileStore;
  /** The public-media bucket published files are copied to. */
  publicMedia: FileStore;
  scanner: FileScanner | null;
  /** Where signed links point: the cookieless files host. */
  filesOrigin: string;
  linkKey: Buffer;
  /** Where players reach the media service's streams; none leaves video as uploaded. */
  mediaOrigin: string | null;
  streamLinkKey: Buffer;
  maxUploadBytes: number;
  /** Which outside channels have a gateway; the rest are logged as skipped. */
  channels: { email: boolean; sms: boolean };
}

export interface RequestContext extends ApiDependencies {
  headers: Headers;
  requestId: string;
}

export interface SchoolContext extends RequestContext {
  school: DirectorySchool;
}

export interface Actor {
  userId: string;
  accountId: string;
  sessionId: string;
  context: SessionContext;
  profile: Profile;
  workspace: Workspace;
  roles: readonly string[];
  capabilities: ReadonlySet<Capability>;
  contexts: readonly SessionContext[];
}

/** A procedure's context inside its unit of work. */
export interface UnitContext extends SchoolContext {
  tx: CellTransaction;
  tenantId: string;
  schoolId: string;
  actor: Actor;
  /** Today in the school's time zone, one clock for the unit of work. */
  today: string;
  now: Date;
  /**
   * Work outside the database that must wait until the unit commits, such as
   * deleting stored bytes a record no longer points at; a rollback skips it.
   */
  afterCommit: (task: () => Promise<void>) => void;
}
