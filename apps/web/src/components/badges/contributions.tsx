import type { MadeSignInsProps } from "~/components/people/slots";
import type { ModuleFillings } from "~/utils/extension";

import { signInWays } from "~/components/people/slots";
import * as m from "~/i18n/messages";
import { fill } from "~/utils/extension";
import { modulePages } from "~/utils/pages";

import { BadgeSheet } from "./BadgeSheet";

function MadeBadges({
  opened,
  student,
  schoolName,
  notes,
  warnings,
  onDone,
}: MadeSignInsProps) {
  return (
    <BadgeSheet
      badges={opened.badges.map((badge) => ({
        ...badge,
        ...student(badge.studentId),
      }))}
      schoolName={schoolName}
      className={null}
      notes={notes}
      warnings={warnings}
      onDone={onDone}
    />
  );
}

/**
 * The badges' pages, a class's badges and the camera a child signs in at,
 * and the badge as a way to give a young child their first sign-in.
 */
export const BADGES: ModuleFillings = {
  module: "badges",
  fillings: [
    fill(modulePages, ["/badges", "/badge"]),
    fill(signInWays, {
      way: "badges",
      place: 10,
      label: m.signInsWayBadges,
      hint: m.signInsWayBadgesHint,
      ready: m.signInsReadyBadges,
      refused: { not_young: m.signInsRefusedNotYoung },
      Made: MadeBadges,
    }),
  ],
};
