import type { ModuleFillings } from "~/utils/extension";

import { liveProjects } from "~/components/learning/slots";
import { galleryQuery } from "~/queries/learning";
import { fill } from "~/utils/extension";

import { LiveProjects } from "./LiveProjects";
import { GalleryOffer, ProjectGallery } from "./ProjectGallery";
import { classGalleries } from "./slots";

/** A lesson's class gallery of projects, and the projects a class builds in a live lesson. */
export const CODING_IN_LESSONS: ModuleFillings = {
  module: "coding",
  needs: ["elearning"],
  fillings: [
    fill(classGalleries, {
      Gallery: ProjectGallery,
      Offer: GalleryOffer,
      queryKey: (lessonId, blockId) => galleryQuery(lessonId, blockId).queryKey,
    }),
    fill(liveProjects, LiveProjects),
  ],
};
