import type { CriterionStandardsProps } from "~/components/coursework/slots";
import type { ModuleFillings } from "~/utils/extension";

import { criterionStandards } from "~/components/coursework/slots";
import * as m from "~/i18n/messages";
import { fill } from "~/utils/extension";

import { StandardsField } from "./StandardsField";

function CriterionStandards({ value, onChange }: CriterionStandardsProps) {
  return (
    <StandardsField
      label={m.rubricStandards()}
      hint={m.rubricStandardsHint()}
      value={value}
      onChange={onChange}
    />
  );
}

/** A rubric's criteria count toward the school's standards. */
export const STANDARDS_IN_WORK: ModuleFillings = {
  module: "standards",
  needs: ["coursework"],
  fillings: [fill(criterionStandards, CriterionStandards)],
};
