import { commonsThumb } from "@faridalms/domain/commons";
import { pictureSearchSchema } from "@faridalms/domain/library";
import { ORPCError } from "@orpc/server";

import type { LibraryPicture } from "../library/pictures";

import { searchesCommons } from "../core/library";
import { localeOf, readProcedure, requireCapability } from "../core/procedure";
import { CommonsBusy } from "../library/commons";
import { searchPictures } from "../library/pictures";

/**
 * Open pictures to put in a lesson or brief, found by what they show: the
 * symbol sets in colour or as line drawings for a colouring page, or, where
 * the school allows it, photographs and drawings from Wikimedia Commons,
 * each with the author and licence it must be kept with.
 */
export const pictures = readProcedure
  .input(pictureSearchSchema)
  .handler(async ({ input, context }) => {
    if (input.collection === "symbols") {
      requireCapability(context, "learning:author", "assignments:author");
      return {
        pictures: searchPictures(input.q, localeOf(context), input.style),
      };
    }
    if (!context.commons || !(await searchesCommons(context)))
      throw new ORPCError("FORBIDDEN");
    try {
      const found = await context.commons(input.q, localeOf(context));
      return {
        pictures: found.map((picture): LibraryPicture => ({
          source: "commons",
          id: picture.title,
          label: picture.alt,
          thumb: commonsThumb(picture.image),
          full: picture.image,
          alt: picture.alt,
          credit: picture.credit,
        })),
      };
    } catch (error) {
      if (error instanceof CommonsBusy)
        throw new ORPCError("SERVICE_UNAVAILABLE", { message: error.message });
      throw error;
    }
  });
