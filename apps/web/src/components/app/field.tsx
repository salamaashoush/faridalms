import type { ComponentProps } from "react";

import { FieldError as PrimitiveFieldError } from "@faridalms/ui/field";

import { validationMessage } from "~/utils/validation";

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
} from "@faridalms/ui/field";

export function FieldError({
  errors,
  ...props
}: ComponentProps<typeof PrimitiveFieldError>) {
  return (
    <PrimitiveFieldError
      {...props}
      errors={errors?.map((issue) =>
        issue ? { message: validationMessage(issue) } : undefined,
      )}
    />
  );
}
