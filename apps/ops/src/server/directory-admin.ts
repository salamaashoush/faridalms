import type { DirectoryAdmin } from "@faridalms/database/directory/admin";

import { openDirectoryAdmin } from "@faridalms/database/directory/admin";

import { opsEnv } from "./env";

let admin: DirectoryAdmin | null = null;

/** The directory as the console writes it. */
export function directoryAdmin(): DirectoryAdmin {
  admin ??= openDirectoryAdmin(opsEnv().OPS_DIRECTORY_URL);
  return admin;
}
