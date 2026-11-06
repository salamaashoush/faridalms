import type { ModuleId } from "@faridalms/domain/modules";

import { BASIC_MODULES, MODULE_IDS } from "@faridalms/domain/modules";
import { Button } from "@faridalms/ui/button";
import { CheckboxGroupField } from "@faridalms/ui/system/form-field";

import { MODULE_NAMES } from "../format";

const OPTIONS = MODULE_IDS.map((module) => ({
  value: module,
  label: MODULE_NAMES[module],
}));

export interface ModuleFieldsProps {
  modules: readonly ModuleId[];
  onChange: (modules: ModuleId[]) => void;
  hint?: string;
}

/** Every module as a checkbox, with shortcuts to Basic and to all of them. */
export function ModuleFields({ modules, onChange, hint }: ModuleFieldsProps) {
  return (
    <CheckboxGroupField
      label="Modules"
      value={modules}
      options={OPTIONS}
      onChange={onChange}
      hint={hint}
      columns
      actions={
        <>
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
        </>
      }
    />
  );
}
