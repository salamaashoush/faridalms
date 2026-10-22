import type { EditorStandards } from "@faridalms/editor";

import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { describeStandards, searchStandards } from "~/server/standards";

/** The school's standards an editor tags its questions with, where it asks any. */
export function useEditorStandards(
  questions: boolean,
): EditorStandards | undefined {
  const queryClient = useQueryClient();
  return useMemo<EditorStandards | undefined>(
    () =>
      questions
        ? {
            search: (query) =>
              queryClient.fetchQuery({
                queryKey: ["standards", "search", query],
                queryFn: () => searchStandards({ data: { query } }),
                staleTime: 30_000,
              }),
            describe: (ids) => describeStandards({ data: { ids } }),
          }
        : undefined,
    [questions, queryClient],
  );
}
