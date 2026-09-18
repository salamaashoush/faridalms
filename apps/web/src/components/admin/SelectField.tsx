import { Field, FieldDescription, FieldLabel } from "~/components/app/field";
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
}: {
  id: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <Field>
      <FieldLabel id={`${id}-label`} htmlFor={id}>
        {label}
      </FieldLabel>
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
          id={id}
          aria-labelledby={`${id}-label ${id}`}
          className="h-11 w-full sm:h-10"
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
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}
