import { useSuspenseQuery } from "@tanstack/react-query";

import * as m from "~/i18n/messages";
import { academicYearsQuery } from "~/queries/academic-years";

import { SelectField } from "./SelectField";
import { YEAR_STATUS_LABEL } from "./YearLifecycle";

/** Chooses the working year of a directory; the default year is the empty value. */
export function YearSwitcher({
  value,
  onChange,
}: {
  value: string;
  onChange: (year: string) => void;
}) {
  const { data: years } = useSuspenseQuery(academicYearsQuery);
  const fallback = years.find((year) => year.isCurrent);
  return (
    <div className="w-full sm:w-64">
      <SelectField
        id="working-year"
        label={m.workingYear()}
        value={value || fallback?.id || ""}
        options={years.map((year) => ({
          value: year.id,
          label: year.isCurrent
            ? m.workingYearDefault({ name: year.name })
            : `${year.name} · ${YEAR_STATUS_LABEL[year.status]()}`,
        }))}
        onChange={(id) => onChange(id === fallback?.id ? "" : id)}
      />
    </div>
  );
}
