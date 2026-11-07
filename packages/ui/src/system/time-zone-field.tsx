import type { ReactNode } from "react";

import type { FieldIssue } from "./form-field";

import { useMemo, useState } from "react";

import { ComboboxField } from "./combobox-field";

export interface TimeZoneFieldProps {
  label: string;
  hint?: ReactNode;
  searchLabel?: string;
  value: string;
  onChange: (value: string) => void;
  errors?: FieldIssue[];
}

/**
 * A time zone chosen from the ones the runtime knows, searched by city:
 * "cairo" finds Africa/Cairo, "new york" America/New_York.
 */
export function TimeZoneField({
  label,
  hint,
  searchLabel,
  value,
  onChange,
  errors,
}: TimeZoneFieldProps) {
  const [search, setSearch] = useState("");
  const zones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);
  const needle = search.trim().toLocaleLowerCase().replaceAll(" ", "_");
  const matches = zones.filter((zone) =>
    zone.toLocaleLowerCase().includes(needle),
  );
  // The chosen zone is always an option, so the trigger can name it even
  // when a search leaves it out or this runtime does not list it.
  const options = (
    value && !matches.includes(value) ? [value, ...matches] : matches
  ).map((zone) => ({ value: zone, label: zone.replaceAll("_", " ") }));
  return (
    <ComboboxField
      label={label}
      hint={hint}
      searchLabel={searchLabel}
      options={options}
      value={value ? [value] : []}
      onChange={(next) => onChange(next[0] ?? value)}
      search={search}
      onSearchChange={setSearch}
      errors={errors}
    />
  );
}
