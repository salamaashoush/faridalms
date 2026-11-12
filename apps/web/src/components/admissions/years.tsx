import type { Facet } from "@faridalms/ui/system/index-toolbar";

import { admissionsYear } from "@faridalms/domain/admissions";
import { SelectField } from "@faridalms/ui/system/form-field";

import type { IntakePartFieldProps } from "~/components/admissions/slots";
import type { ViewValue } from "~/components/classes/slots";
import type { yearOptionsQuery } from "~/queries/years";
import type { ModuleFillings } from "~/utils/extension";

import { intakeFilters, intakeParts } from "~/components/admissions/slots";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { yearOptionsQuery as yearOptions } from "~/queries/years";
import { fill } from "~/utils/extension";
import { replaceWords } from "~/utils/words";

type Options = Awaited<
  ReturnType<NonNullable<(typeof yearOptionsQuery)["queryFn"]>>
>;

const NONE = "none";

/** The years an intake may admit into, and a list may be narrowed to: those not closed. */
const openYears = (read: unknown) =>
  (read as Options).years.filter((year) => year.lifecycle !== "closed");

const yearIdOf = (value: unknown) =>
  typeof value === "object" && value && "yearId" in value
    ? String(value.yearId)
    : "";

function yearFacet(
  read: unknown,
  value: ViewValue,
  onChange: (value: ViewValue) => void,
): Facet | null {
  const years = openYears(read);
  if (years.length === 0) return null;
  const chosen = typeof value === "string" ? value : undefined;
  const standing = admissionsYear(years, (read as Options).today)?.id ?? "all";
  return {
    id: "year",
    label: m.itkFieldYear(),
    single: true,
    options: [
      ...years.map((year) => ({
        value: year.id,
        label: inLocale(year.titleEn, year.titleAr),
      })),
      { value: "all", label: m.itkEveryIntake() },
    ],
    selected: [chosen ?? standing],
    defaultSelected: [standing],
    onChange: ([next]) => onChange(next === standing ? undefined : next),
  };
}

/** The school year an intake admits into, on its form; fixed once it has one. */
function IntakeYearField({
  read,
  value,
  fixed,
  onChange,
}: IntakePartFieldProps) {
  const yearId = yearIdOf(value);
  return (
    <SelectField
      id="intake-year"
      label={m.itkFieldYear()}
      optional
      value={yearId || NONE}
      disabled={fixed && yearId !== ""}
      options={[
        ...openYears(read).map((year) => ({
          value: year.id,
          label: inLocale(year.titleEn, year.titleAr),
        })),
        { value: NONE, label: m.commonNotRecorded() },
      ]}
      onChange={(next) => onChange({ yearId: next === NONE ? "" : next })}
      width="name"
    />
  );
}

/** Intakes by school year, where admissions and school years are both on. */
export const ADMISSIONS_IN_YEARS: ModuleFillings = {
  module: "admissions",
  needs: ["school_years"],
  fillings: [
    fill(intakeFilters, {
      key: "year",
      query: () => yearOptions,
      facetOf: yearFacet,
    }),
    fill(intakeParts, {
      key: "year",
      label: m.itkFieldYear,
      letterHint: m.ltrFieldYear,
      query: () => yearOptions,
      initial: (read, search) => {
        const years = openYears(read);
        const asked = typeof search.year === "string" ? search.year : "";
        const year =
          years.find((row) => row.id === asked) ??
          admissionsYear(years, (read as Options).today);
        return year
          ? { value: { yearId: year.id }, startsOn: year.startsOn }
          : { value: { yearId: "" } };
      },
      titleOf: (read, value) => {
        const year = openYears(read).find((row) => row.id === yearIdOf(value));
        return year
          ? {
              en: year.titleEn ?? year.titleAr ?? "",
              ar: year.titleAr ?? year.titleEn ?? "",
            }
          : null;
      },
      suggest: (read, value) => {
        const year = openYears(read).find((row) => row.id === yearIdOf(value));
        return year ? { startsOn: year.startsOn } : {};
      },
      Field: IntakeYearField,
    }),
    replaceWords(m.itkCaptionCore, m.itkCaption, ["grade_levels"]),
    replaceWords(m.itkEmptyCore, m.itkEmpty),
    replaceWords(m.adrEmptyCore, m.adrEmpty),
    replaceWords(m.decDeferActionCore, m.decDeferAction),
    replaceWords(m.decDeferHintCore, m.decDeferHint),
    replaceWords(m.itkFeeTuitionCore, m.itkFeeTuition),
  ],
};
