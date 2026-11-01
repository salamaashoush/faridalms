export type FamilyRole = "parent" | "guardian" | "relative";

/**
 * Relations that make children brothers and sisters. A grandparent or aunt
 * linked to children of two homes would otherwise make cousins siblings.
 */
export const PARENTAL_MEANINGS = [
  "mother",
  "father",
  "step_parent",
  "guardian",
  "unspecified",
] as const;

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

/**
 * What a guardian's link to a child is asked to allow, from the least to
 * the most: following the child in the portal, being contacted about them,
 * and reading their medical summary. `app.guardian_permits` in the cell
 * database decides each from the link's flags.
 */
export const GUARDIAN_PURPOSES = ["follow", "contact", "health"] as const;
export type GuardianPurpose = (typeof GUARDIAN_PURPOSES)[number];
