import type { EditorStandards } from "@faridalms/editor";

import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import type { EditorPartProps } from "~/components/content/slots";

import { describeStandards, searchStandards } from "~/server/standards";

/** The school's standards an editor tags its questions with, where it asks any. */
function useEditorStandards(questions: boolean): EditorStandards | undefined {
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

/** Lends the editor the school's standards, for its questions and a unit plan's standards blocks. */
export function StandardsEditorPart({
  teaching,
  standards,
  children,
}: EditorPartProps) {
  return children({ standards: useEditorStandards(teaching || standards) });
}
