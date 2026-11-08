import { pictureSearchSchema } from "@faridalms/domain/library";

import { localeOf, readProcedure, requireCapability } from "../core/procedure";
import { searchPictures } from "../library/pictures";

/**
 * Open pictures to put in a lesson or brief, found by what they show, in
 * colour or as line drawings for a colouring page.
 */
export const pictures = readProcedure
  .input(pictureSearchSchema)
  .handler(({ input, context }) => {
    requireCapability(context, "learning:author", "assignments:author");
    return {
      pictures: searchPictures(input.q, localeOf(context), input.style),
    };
  });
