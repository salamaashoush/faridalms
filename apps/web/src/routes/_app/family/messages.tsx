import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import * as v from "valibot";

import {
  inboxOf,
  MessagesPage,
  messagesSearchSchema,
} from "~/components/messages/Inbox";
import { inboxQuery, threadQuery } from "~/queries/messages";

const DEFAULT_SEARCH = v.parse(messagesSearchSchema, {});

export const Route = createFileRoute("/_app/family/messages")({
  validateSearch: messagesSearchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(inboxQuery(inboxOf(deps))),
      ...(deps.thread
        ? [context.queryClient.ensureQueryData(threadQuery(deps.thread))]
        : []),
    ]);
  },
  component: MessagesRoute,
});

function MessagesRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <MessagesPage
      search={search}
      onSearch={(change, replace) =>
        void navigate({
          search: (previous) => ({ ...previous, ...change }),
          replace,
        })
      }
    />
  );
}
