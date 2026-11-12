import type { ProjectFile } from "@faridalms/domain/project";
import type { ComponentType } from "react";

import type { BoardAnswer } from "~/components/questions/AnswerBoard";

import { slot } from "~/utils/extension";

export interface ClassGalleryProps {
  lessonId: string;
  blockId: string;
  /** The student's project is marked, so it can no longer begin again. */
  settled: boolean;
  onRemixed?: (files: ProjectFile[]) => void;
  onBuild?: (from: {
    studentId: string;
    name: string;
    projectUrl: string;
  }) => void;
}

export interface GalleryOfferProps {
  answer: BoardAnswer;
  name: string;
}

/**
 * A lesson's class gallery of a project question: the classmates' projects
 * a learner sees under their own, and their offer as their teacher decides
 * it.
 */
export interface ClassGallery {
  Gallery: ComponentType<ClassGalleryProps>;
  Offer: ComponentType<GalleryOfferProps>;
  /** What is read again once a learner keeps a newer project to offer. */
  queryKey(lessonId: string, blockId: string): readonly unknown[];
}

export const classGalleries = slot<ClassGallery>("class galleries");
