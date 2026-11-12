import {
  retireSupersededAnswers,
  retireTemplateModule,
} from "@faridalms/database/stores/learning";
import { SAVES_KEPT, SUPERSEDED_SAVE_MS } from "@faridalms/domain/file";

import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { templateParts } from "../core/templates";
import { fileHosts } from "../files/authorize";
import { fileSweeps } from "../files/sweep";
import { searchSources } from "../search/points";
import { ELEARNING_HOSTS } from "./hosts";
import { LEARNING_SEARCH } from "./search";

/** What e-learning adds to core: its lessons, modules and plans as kinds of record, and the module a template keeps. */
export const ELEARNING: ModuleContributions = {
  module: "elearning",
  contributions: [
    contribute(fileHosts, ELEARNING_HOSTS),
    contribute(searchSources, LEARNING_SEARCH),
    contribute(fileSweeps, {
      retire: (tx, tenantId, input) =>
        retireSupersededAnswers(tx, tenantId, {
          kept: SAVES_KEPT,
          savedBefore: new Date(input.now.getTime() - SUPERSEDED_SAVE_MS),
          limit: input.limit,
        }),
    }),
    // A whole module's copy is the piece's alone, and goes with it.
    contribute(templateParts, {
      removed: (context, templateId) =>
        retireTemplateModule(context.tx, {
          tenantId: context.tenantId,
          templateId,
        }),
    }),
  ],
};
