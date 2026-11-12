import { BookOpen, Layers } from "lucide-react";

import type { ModuleFillings } from "~/utils/extension";

import { moduleSwitches } from "~/components/admin/slots";
import { navItems } from "~/components/app/navigation";
import { searchKindWords } from "~/components/app/SearchResults";
import { classRecordSections } from "~/components/classes/slots";
import { templateUses } from "~/components/templates/slots";
import * as m from "~/i18n/messages";
import { fill } from "~/utils/extension";
import { modulePages } from "~/utils/pages";

import { LessonSoundsSection } from "./LessonSounds";
import { LEARNING_TEMPLATES } from "./templates";
import { ELEARNING_TODAY } from "./today";

/** What e-learning shows in the pages of core and other modules. */
export const ELEARNING: ModuleFillings = {
  module: "elearning",
  fillings: [
    fill(moduleSwitches, {
      module: "elearning",
      place: 10,
      name: m.learningFeatureToggle,
      hint: m.learningFeatureToggleHintCore,
    }),
    ...LEARNING_TEMPLATES.map((use) => fill(templateUses, use)),
    fill(searchKindWords, {
      kind: "learning",
      label: m.searchKindLearning,
      icon: BookOpen,
      linkOf: (hit) =>
        hit.target === "lesson"
          ? { to: "/lessons/$lessonId", params: { lessonId: hit.id } }
          : { to: "/modules/$moduleId", params: { moduleId: hit.id } },
    }),
    ...ELEARNING_TODAY,
    fill(modulePages, [
      "/modules",
      "/module-editor",
      "/module-plan",
      "/lesson-editor",
      "/board",
      "/live",
      "/me/modules",
      "/family/modules",
      "/lessons",
      "/lesson-frame",
      "/practice",
    ]),
    fill(navItems, {
      workspace: "staff",
      section: "teaching",
      item: {
        to: "/modules",
        label: m.navModules,
        icon: Layers,
        capability: "learning:author",
        place: 50,
      },
    }),
    fill(navItems, {
      workspace: "me",
      section: "home",
      item: {
        to: "/me/modules",
        label: m.navModules,
        icon: Layers,
        capability: "learning:read",
        place: 60,
      },
    }),
    fill(navItems, {
      workspace: "family",
      section: "home",
      item: {
        to: "/family/modules",
        label: m.navModules,
        icon: Layers,
        capability: "children:read",
        place: 70,
      },
    }),
    fill(classRecordSections, { key: "sounds", Section: LessonSoundsSection }),
  ],
};
