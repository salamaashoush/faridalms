import type { MentionKind } from "@faridalms/domain/content";
import type { SearchTarget } from "@faridalms/domain/search";
import type { EditorMentions } from "@faridalms/editor";

import { useMemo } from "react";

import { search } from "~/server/search";

const KIND_OF: Partial<Record<SearchTarget, MentionKind>> = {
  student: "person",
  person: "person",
  class: "class",
  module: "module",
  lesson: "lesson",
  assignment: "assignment",
};

/** Few enough to choose among by eye. */
const MOST = 8;

/**
 * Whom and what a writer may mention: the people and teaching the school's
 * search finds for them, so nobody is named whom they could not find.
 */
export function useEditorMentions(): EditorMentions {
  return useMemo(
    () => ({
      search: async (query) => {
        const result = await search({ data: { q: query, kind: "all" } });
        return result.groups
          .flatMap((group) => group.rows)
          .flatMap((hit) => {
            const kind = KIND_OF[hit.target];
            return kind
              ? [
                  {
                    kind,
                    id: hit.id,
                    label: hit.title,
                    ...(hit.context ? { detail: hit.context } : {}),
                  },
                ]
              : [];
          })
          .slice(0, MOST);
      },
    }),
    [],
  );
}
