import type { XapiAgent } from "@faridalms/domain/xapi";

import { nameUuid } from "../core/names";
import { sealerOf } from "../lti/crypto";

/** The namespace this app's statement ids are made in, so the same record gives the same id. */
const STATEMENT_NAMESPACE = Buffer.from(
  "010710a06f1d44adbd941164c94a4add",
  "hex",
);

/** A statement's id, the same each time for the same record. */
export const statementId = (name: string) =>
  nameUuid(STATEMENT_NAMESPACE, name);

/**
 * A student as statements name them: by their id under the school's
 * address, never their email, with their name when it is known.
 */
export const learnerOf = (
  home: string,
  studentId: string,
  name?: string | null,
): XapiAgent => ({
  objectType: "Agent",
  ...(name ? { name } : {}),
  account: { homePage: home, name: studentId },
});

/** Activities' addresses under the school's own address. */
export const activityIds = {
  module: (home: string, id: string) => `${home}/modules/${id}`,
  lesson: (home: string, id: string) => `${home}/lessons/${id}`,
  course: (home: string, id: string) => `${home}/classes/${id}`,
  assignment: (home: string, id: string) => `${home}/assignments/${id}`,
  toolColumn: (home: string, id: string) => `${home}/lti/ags/lineitems/${id}`,
};

/** The secret a school's record store gave it, sealed for keeping. */
export const recordStoreSecrets = (cellSecret: Uint8Array<ArrayBuffer>) =>
  sealerOf(cellSecret, "xapi record store secrets");
