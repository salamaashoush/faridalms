import type { ManagementOptionsInput } from "@faridalms/domain/administration-schema";

import { Button } from "@faridalms/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@faridalms/ui/combobox";
import { Skeleton } from "@faridalms/ui/skeleton";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useDeferredValue, useId, useState } from "react";

import { Field, FieldLabel, FieldError } from "~/components/app/field";
import * as m from "~/i18n/messages";
import { managementOptionsQuery } from "~/queries/school";

type Kind = ManagementOptionsInput["kind"];
interface PickerProps {
  kind: Kind;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  multiple?: boolean;
  errors?: Array<{ message?: string } | undefined>;
}
export function RecordPicker({
  kind,
  label,
  value,
  onChange,
  errors,
}: {
  kind: Kind;
  label: string;
  value: string;
  onChange: (value: string) => void;
  errors?: Array<{ message?: string } | undefined>;
}) {
  return (
    <RecordMultiPicker
      kind={kind}
      label={label}
      values={value ? [value] : []}
      onChange={(values) => onChange(values[0] ?? "")}
      multiple={false}
      errors={errors}
    />
  );
}
function RecordMultiPicker(props: PickerProps) {
  return (
    <Suspense
      fallback={
        <Field>
          <FieldLabel>{props.label}</FieldLabel>
          <Skeleton className="h-9 w-full" />
        </Field>
      }
    >
      <Picker {...props} />
    </Suspense>
  );
}
function Picker({
  kind,
  label,
  values,
  onChange,
  multiple = true,
  errors,
}: PickerProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const selectedIds = useDeferredValue(values);
  const id = useId();
  const { data } = useSuspenseQuery(
    managementOptionsQuery({ kind, q: deferredQuery, selectedIds }),
  );
  const names = new Map(data.map((row) => [row.id, row.name]));
  const content = (
    <>
      <ComboboxTrigger
        id={id}
        aria-invalid={Boolean(errors?.length) || undefined}
        aria-describedby={errors?.length ? `${id}-error` : undefined}
        render={
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full justify-between font-normal sm:h-10"
          />
        }
      >
        <span className="truncate">
          {values.length
            ? values
                .map((value) => names.get(value) ?? m.commonNotRecorded())
                .join(", ")
            : m.managementChoose({ label })}
        </span>
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput
          showTrigger={false}
          aria-label={m.managementSearchFor({ label })}
          placeholder={m.managementSearchFor({ label })}
        />
        <ComboboxEmpty>{m.managementNoMatches()}</ComboboxEmpty>
        <ComboboxList>
          {(value: string) => (
            <ComboboxItem key={value} value={value}>
              {names.get(value)}
            </ComboboxItem>
          )}
        </ComboboxList>
        {values.length ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="m-1"
            onClick={() => onChange([])}
          >
            {m.managementClear({ label })}
          </Button>
        ) : null}
      </ComboboxContent>
    </>
  );
  const common = {
    items: data.map((row) => row.id),
    itemToStringLabel: (value: string) => names.get(value) ?? "",
    filter: null,
    inputValue: query,
    onInputValueChange: setQuery,
  };
  return (
    <Field data-invalid={Boolean(errors?.length) || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {multiple ? (
        <Combobox {...common} multiple value={values} onValueChange={onChange}>
          {content}
        </Combobox>
      ) : (
        <Combobox
          {...common}
          value={values[0] ?? null}
          onValueChange={(value) => onChange(value ? [value] : [])}
        >
          {content}
        </Combobox>
      )}
      <FieldError id={`${id}-error`} errors={errors} />
    </Field>
  );
}
