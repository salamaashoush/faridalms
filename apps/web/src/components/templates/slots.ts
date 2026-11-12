import type { TemplateKind } from "@faridalms/domain/templates";
import type { QueryClient } from "@tanstack/react-query";
import type { UseNavigateResult } from "@tanstack/react-router";
import type { ComponentType } from "react";

import type { SlotQuery } from "~/utils/extension";

import { slot } from "~/utils/extension";

export interface TemplateStart {
  templateId: string;
  /** The place picked to start it in, or empty where none was offered. */
  place: string;
  navigate: UseNavigateResult<string>;
  queryClient: QueryClient;
}

/** Where a template of a kind starts: a module, a class, a purpose. */
export interface TemplatePlaces {
  query(): SlotQuery<unknown>;
  options(read: unknown): { value: string; label: string }[];
  label: () => string;
  hint?: () => string;
  /** Nothing starts until a place is picked. */
  required: boolean;
}

/** What a template of a kind is used for, by the module that owns the kind. */
export interface TemplateUse {
  kind: TemplateKind;
  places?: TemplatePlaces;
  /** Shown in place of a document, for a kind that keeps something else. */
  Preview?: ComponentType<{ templateId: string }>;
  /** Started from the template's sheet; a kind used elsewhere says where instead. */
  start?: {
    label?: () => string;
    run(start: TemplateStart): Promise<unknown> | void;
  };
  elsewhere?: () => string;
}

export const templateUses = slot<TemplateUse>("template uses");
