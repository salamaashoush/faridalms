import type { ModuleId } from "@faridalms/domain/modules";

import { BASIC_MODULES, MODULE_IDS } from "@faridalms/domain/modules";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";

import { MODULE_NAMES } from "../format";

/** Every module as a checkbox, with shortcuts to Basic and to all of them. */
export function ModuleFields({
  prefix,
  modules,
  onChange,
  hint,
}: {
  prefix: string;
  modules: readonly ModuleId[];
  onChange: (modules: ModuleId[]) => void;
  hint?: string;
}) {
  return (
    <fieldset className="grid gap-3 text-sm">
      <legend className="mb-1 font-medium">Modules</legend>
      <span className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...BASIC_MODULES])}
        >
          Basic
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...MODULE_IDS])}
        >
          Every module
        </Button>
      </span>
      {MODULE_IDS.map((module) => (
        <span key={module} className="flex items-center gap-2">
          <Checkbox
            id={`${prefix}-module-${module}`}
            checked={modules.includes(module)}
            onCheckedChange={(checked) =>
              onChange(
                checked
                  ? [...modules, module]
                  : modules.filter((item) => item !== module),
              )
            }
          />
          <label htmlFor={`${prefix}-module-${module}`}>
            {MODULE_NAMES[module]}
          </label>
        </span>
      ))}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </fieldset>
  );
}
