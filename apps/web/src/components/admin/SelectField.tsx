import type { ReactNode } from "react";

import { FormField } from "~/components/app/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

export function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  description,
  disabled,
  optional,
}: {
  id: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  description?: ReactNode;
  disabled?: boolean;
  optional?: boolean;
}) {
  return (
    <FormField
      id={id}
      labelId={`${id}-label`}
      label={label}
      optional={optional}
      description={description}
    >
      {(control) => (
        <Select
          items={options}
          value={value}
          disabled={disabled}
          onValueChange={(next) => {
            const match = options.find((option) => option.value === next);
            if (match) onChange(match.value);
          }}
        >
          <SelectTrigger
            {...control}
            aria-labelledby={`${id}-label ${id}`}
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}
