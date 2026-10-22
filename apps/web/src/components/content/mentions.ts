import type {
  ContentDocument,
  Mention,
  MentionKind,
} from "@faridalms/domain/content";
import type { SearchTarget } from "@faridalms/domain/search";
import type { EditorMentions } from "@faridalms/editor";

import { contentMentions } from "@faridalms/domain/content";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { mentionNames, search } from "~/server/search";

const KIND_OF: Partial<Record<SearchTarget, MentionKind>> = {
  student: "person",
  person: "person",
  class: "class",
  module: "module",
  lesson: "lesson",
  assignment: "assignment",
  news: "news",
  announcement: "announcement",
  event: "event",
};

/** Few enough to choose among by eye. */
const MOST = 8;

/**
 * What the people and things a document mentions are called now, as far
 * as its reader may find them, so a name changed since it was written
 * reads as it is today. Nothing is asked of a document that mentions none.
 */
export function useMentionNames(
  document: ContentDocument,
): ((mention: Mention) => string | undefined) | undefined {
  const mentions = useMemo(() => contentMentions(document), [document]);
  const ids = mentions
    .map((mention) => mention.id)
    .toSorted()
    .join(",");
  const names = useQuery({
    queryKey: ["mentions", "names", ids],
    queryFn: () =>
      mentionNames({
        data: {
          mentions: mentions.map(({ kind, id }) => ({ kind, id })),
        },
      }),
    enabled: mentions.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return useMemo(() => {
    if (!names.data) return undefined;
    const byId = new Map(names.data.map((row) => [row.id, row.name]));
    return (mention) => byId.get(mention.id);
  }, [names.data]);
}

/**
 * Whom and what a writer may mention: the people and teaching the school's
 * search finds for them, so nobody is named whom they could not find.
 */
export function useEditorMentions(
  name?: (mention: Mention) => string | undefined,
): EditorMentions {
  return useMemo(
    () => ({
      ...(name ? { name } : {}),
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
    [name],
  );
}
