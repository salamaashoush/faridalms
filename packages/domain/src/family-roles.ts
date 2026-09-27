export type FamilyRole = "parent" | "guardian" | "relative";

/**
 * The natural role a relationship gives the related person at the student's
 * schools, or null when it gives none. A relationship makes someone a member
 * only while it grants portal access or legal guardianship; a contact number
 * alone never does.
 */
export function familyRoleFor(
  meaning: string,
  link: {
    portalAccess: boolean;
    legalGuardian: boolean | null;
    accessBasis?: string;
  },
): FamilyRole | null {
  if (!link.portalAccess && link.legalGuardian !== true) return null;
  switch (meaning) {
    case "mother":
    case "father":
      return "parent";
    case "guardian":
    case "unspecified":
      return "guardian";
    case "step_parent":
    case "grandparent":
    case "sibling":
    case "other_relative":
      return "relative";
    case "non_relative":
      return link.portalAccess && link.accessBasis === "school_designated"
        ? "relative"
        : null;
    default:
      return null;
  }
}
