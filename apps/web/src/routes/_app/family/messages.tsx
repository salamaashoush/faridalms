import { createFileRoute, redirect } from "@tanstack/react-router";

import {
  MessagesPage,
  messagesSearchSchema,
} from "~/components/communication/MessagesPage";
import {
  messageDraftQuery,
  messageDraftsQuery,
} from "~/queries/message-drafts";
import {
  messagesQuery,
  recipientsQuery,
  visibleStudentsQuery,
} from "~/queries/school";

export const Route = createFileRoute("/_app/family/messages")({
  validateSearch: messagesSearchSchema,
  loaderDeps: ({ search }) => ({
    folder: search.folder,
    q: search.q,
    page: search.page,
    compose: search.compose,
    draft: search.draft,
    drafts: search.drafts,
  }),
  loader: async ({ context, deps }) => {
    const draft = deps.draft
      ? await context.queryClient.ensureQueryData(messageDraftQuery(deps.draft))
      : undefined;
    if (draft?.sentMessageId)
      throw redirect({
        to: "/family/messages",
        search: {
          compose: false,
          drafts: false,
          draft: "",
          folder: "sent",
          page: 1,
          q: "",
          message: draft.sentMessageId,
        },
      });
    await Promise.all([
      ...(deps.drafts
        ? [context.queryClient.ensureQueryData(messageDraftsQuery(deps.page))]
        : []),
      context.queryClient.ensureQueryData(
        messagesQuery({ folder: deps.folder, q: deps.q, page: deps.page }),
      ),
      ...(deps.compose
        ? [
            context.queryClient.ensureQueryData(visibleStudentsQuery),
            context.queryClient.ensureQueryData(
              recipientsQuery(draft?.category ?? "teachers"),
            ),
          ]
        : []),
    ]);
  },
  component: RouteComponent,
});

function RouteComponent() {
  return <MessagesPage search={Route.useSearch()} />;
}
