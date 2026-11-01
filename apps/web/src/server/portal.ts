import {
  findSchoolsSchema,
  portalFaceSchema,
} from "@faridalms/domain/portal-face";
import { createServerFn } from "@tanstack/react-start";

import { backend } from "./backend";
import { checked } from "./input";

const isCode = (error: unknown, code: string) =>
  error instanceof Error && "code" in error && error.code === code;

/**
 * How a school's portal looks before sign-in. Sign-in must keep working when
 * the look cannot be read, so a failure draws the platform's own page.
 */
export const getPortalFace = createServerFn({ method: "GET" })
  .validator(checked(portalFaceSchema))
  .handler(async ({ data }) => {
    try {
      return await backend(null).identity.portalFace(data);
    } catch (error) {
      if (!isCode(error, "NOT_FOUND"))
        console.error(
          JSON.stringify({
            portalFace: data.school,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      return null;
    }
  });

export const findSchools = createServerFn({ method: "GET" })
  .validator(checked(findSchoolsSchema))
  .handler(async ({ data }) => {
    try {
      return {
        limited: false,
        ...(await backend(null).identity.findSchools(data)),
      };
    } catch (error) {
      if (isCode(error, "TOO_MANY_REQUESTS"))
        return { limited: true, schools: [] };
      throw error;
    }
  });
