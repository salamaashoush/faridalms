import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
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
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label id={`${id}-label`} htmlFor={id}>
        {label}
      </Label>
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
          className="h-11 w-full sm:h-9 sm:w-64"
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
    </div>
  );
}
