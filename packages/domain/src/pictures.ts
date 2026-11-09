import * as v from "valibot";

/**
 * An open picture in colour, or as its maker's black line drawing for a
 * child to colour in: ARASAAC's pictograms without their colour, OpenMoji's
 * black set.
 */
export const PICTURE_STYLES = ["colour", "lines"] as const;
export type PictureStyle = (typeof PICTURE_STYLES)[number];

/**
 * Where a picture search looks: the open symbol and emoji sets the product
 * carries, or photographs and drawings on Wikimedia Commons, which a school
 * turns on for its staff.
 */
export const PICTURE_COLLECTIONS = ["symbols", "commons"] as const;
export type PictureCollection = (typeof PICTURE_COLLECTIONS)[number];

/** The school's switch for searching Wikimedia Commons, off until it is turned on. */
export const COMMONS_SWITCH = "commons_pictures";

export const pictureSearchSchema = v.object({
  q: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60)),
  style: v.optional(v.picklist(PICTURE_STYLES), "colour"),
  collection: v.optional(v.picklist(PICTURE_COLLECTIONS), "symbols"),
});

export const commonsSwitchSchema = v.object({ enabled: v.boolean() });

export type PictureSource = "arasaac" | "openmoji";

/** The OpenMoji release the open emoji are read from. */
export const OPENMOJI_VERSION = "15.1.0";

/** Where an open picture is fetched from: a small copy to choose, and the one kept. */
export function openPictureUrls(
  source: PictureSource,
  id: string,
  style: PictureStyle = "colour",
) {
  if (source === "arasaac") {
    if (style === "lines") {
      // ARASAAC serves its black and white pictograms only through its API,
      // and at no size below 500 pixels.
      const lines = `https://api.arasaac.org/v1/pictograms/${id}?color=false`;
      return { thumb: lines, full: lines };
    }
    return {
      thumb: `https://static.arasaac.org/pictograms/${id}/${id}_300.png`,
      full: `https://static.arasaac.org/pictograms/${id}/${id}_500.png`,
    };
  }
  const set = style === "lines" ? "black" : "color";
  const svg = `https://cdn.jsdelivr.net/npm/openmoji@${OPENMOJI_VERSION}/${set}/svg/${id}.svg`;
  return { thumb: svg, full: svg };
}
