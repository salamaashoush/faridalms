import * as v from "valibot";

export const pictureSearchSchema = v.object({
  q: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60)),
});

export type PictureSource = "arasaac" | "openmoji";

/** The OpenMoji release the library's emoji are read from. */
export const OPENMOJI_VERSION = "15.1.0";

/** Where a library picture is fetched from: a small copy to choose, and the one kept. */
export function libraryPictureUrls(source: PictureSource, id: string) {
  if (source === "arasaac")
    return {
      thumb: `https://static.arasaac.org/pictograms/${id}/${id}_300.png`,
      full: `https://static.arasaac.org/pictograms/${id}/${id}_500.png`,
    };
  const svg = `https://cdn.jsdelivr.net/npm/openmoji@${OPENMOJI_VERSION}/color/svg/${id}.svg`;
  return { thumb: svg, full: svg };
}
