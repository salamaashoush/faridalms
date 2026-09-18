import * as m from "~/i18n/messages";

export type GuardianRelation = "father" | "mother" | "guardian" | "other";

export const RELATION_LABEL: Record<GuardianRelation, () => string> = {
  father: m.relationFather,
  mother: m.relationMother,
  guardian: m.relationGuardian,
  other: m.relationOther,
};
