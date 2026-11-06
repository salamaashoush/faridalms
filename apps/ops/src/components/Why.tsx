import { TextField } from "@faridalms/ui/system/form-field";

export interface WhyFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Whether a save was tried, so a missing reason now shows as an error. */
  submitted: boolean;
  placeholder?: string;
  id?: string;
}

/** Why a change is made, which the change log keeps beside it. */
export function WhyField({
  value,
  onChange,
  submitted,
  placeholder,
  id,
}: WhyFieldProps) {
  return (
    <TextField
      id={id}
      label="Why"
      hint="Kept in the change log."
      maxLength={500}
      value={value}
      placeholder={placeholder}
      errors={
        submitted && !value.trim()
          ? ["Say why, for the change log."]
          : undefined
      }
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
