import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@faridalms/ui/select";

import { Field, FieldLabel } from "~/components/app/field";
import * as m from "~/i18n/messages";

export interface ClassOption {
  id: string;
  name: string;
}

export function ClassPicker({
  id,
  label,
  value,
  classes,
  withAllOption = false,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  classes: ClassOption[];
  withAllOption?: boolean;
  onChange: (classId: string) => void;
}) {
  const items = [
    ...(withAllOption ? [{ value: "", label: m.teachAllClasses() }] : []),
    ...classes.map((row) => ({ value: row.id, label: row.name })),
  ];

  return (
    <Field className="min-w-0">
      <FieldLabel id={`${id}-label`} htmlFor={id}>
        {label}
      </FieldLabel>
      <Select
        items={items}
        value={value}
        onValueChange={(next) => {
          onChange(next ?? "");
        }}
      >
        <SelectTrigger
          id={id}
          // Self-reference keeps the chosen class in the announced name; the
          // label alone would read the control as unset.
          aria-labelledby={`${id}-label ${id}`}
          className="h-11 w-full sm:h-10"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
