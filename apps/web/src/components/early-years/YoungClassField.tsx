import { Checkbox } from "@faridalms/ui/checkbox";

import type { ClassEditorPartProps } from "~/components/classes/slots";

import * as m from "~/i18n/messages";

const youngOf = (value: unknown) =>
  typeof value === "object" &&
  value !== null &&
  "young" in value &&
  value.young === true;

/** Whether a class is for young children, on the class form. */
export function YoungClassField({ value, onChange }: ClassEditorPartProps) {
  return (
    <div className="grid gap-1">
      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox
          checked={youngOf(value)}
          onCheckedChange={(young) => onChange({ young })}
          aria-describedby="class-young-hint"
        />
        {m.classYoung()}
      </label>
      <p
        id="class-young-hint"
        className="text-[13px] leading-[18px] text-muted-foreground"
      >
        {m.classYoungHint()}
      </p>
    </div>
  );
}
