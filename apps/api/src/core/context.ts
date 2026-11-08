import type { Cell, CellTransaction } from "@faridalms/database/context";
import type {
  Directory,
  DirectorySchool,
  DirectorySync,
} from "@faridalms/database/directory/client";
import type { Capability, Profile } from "@faridalms/domain/capabilities";
import type { PlatformDomains } from "@faridalms/domain/hosts";
import type { SessionContext, Workspace } from "@faridalms/domain/workspace";
import type { Provider } from "@faridalms/mail/providers";

import type { CodeRunner } from "../coding/run";
import type { FileScanner } from "../files/scan";
import type { FileStore } from "../files/store";
import type { HostChecks } from "../hosts/checks";
import type { InboundMail } from "../messages/inbound";
import type { Intake } from "./intake";
import type { KeyRing } from "./keys";
import type { LoginIndex } from "./login-index";
import type { Turnstile } from "./turnstile";

/** Everything a request can reach, built once per process. */
export interface ApiDependencies {
  cell: Cell;
  directory: Directory;
  keys: KeyRing;
  cellId: string;
  cellSecret: Uint8Array<ArrayBuffer>;
  /** The platform's names for schools' portals and websites. */
  domains: PlatformDomains;
  /** The edge's public IPv4, which a school's own apex points at; null where unset. */
  edgeAddress: string | null;
  /**
   * The cell's write access to its schools' own hosts and the worker that
   * checks them; null without the directory_sync login.
   */
  hosts: { registry: DirectorySync["hosts"]; checks: HostChecks } | null;
  /**
   * Which tenants hold a sign-in name, for sign-in on the bare portal
   * domain; none where the platform's index key is not set.
   */
  logins?: LoginIndex | null;
  /** Proxies in front of the API that append to `X-Forwarded-For`. */
  trustedProxyHops: number;
  files: FileStore;
  /** The public-media bucket published files are copied to. */
  publicMedia: FileStore;
  scanner: FileScanner | null;
  /** Run code exercises to mark them; no Python leaves its exercises unmarkable. */
  runners: { python: CodeRunner | null; javascript: CodeRunner };
  /** Where signed links point: the cookieless files host. */
  filesOrigin: string;
  linkKey: Buffer;
  /** Where players reach the media service's streams; none leaves video as uploaded. */
  mediaOrigin: string | null;
  /** Whether the media service drafts captions from speech. */
  mediaCaptions: boolean;
  streamLinkKey: Buffer;
  maxUploadBytes: number;
  /** The size of each part of a large upload; the usual size when unset. */
  uploadPartBytes?: number;
  /** The most a video may weigh, which goes up in parts; the usual limit when unset. */
  maxVideoBytes?: number;
  /** Which outside channels have a gateway; the rest are logged as skipped. */
  channels: { email: boolean; sms: boolean };
  /**
   * The email gateway, for the few messages that carry a secret and so are
   * sent as they are made and never stored; none where email is not set up.
   */
  mail: Provider | null;
  /**
   * Where the product site's demonstration requests are emailed; unset, the
   * product site takes none.
   */
  productInbox?: string | null;
  /**
   * The operator console's lead intake: demonstration requests and a
   * school's questions about a module go there too; null where it is not.
   */
  intake?: Intake | null;
  /**
   * Cloudflare Turnstile for the websites' public forms; null leaves them to
   * the hidden field, the fill time and the per-network and per-school limits.
   */
  turnstile?: Turnstile | null;
  /**
   * Replies to conversations' email, received through Resend at the
   * inbound domain; null leaves families answering the school's address.
   */
  inbound?: InboundMail | null;
  /**
   * Where the collaboration server takes the API's signals for its rooms,
   * on the internal network; none leaves a led lesson's students asking.
   */
  signalUrl?: string | null;
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
  /** The school's account is paused: it reads, and writes nothing but its sessions. */
  paused: boolean;
  /**
   * Work outside the database that must wait until the unit commits, such as
   * deleting stored bytes a record no longer points at; a rollback skips it.
   */
  afterCommit: (task: () => Promise<void>) => void;
}
