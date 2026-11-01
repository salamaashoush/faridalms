import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import * as v from "valibot";

import {
  loadMessages,
  MessagesPage,
  messagesSearchSchema,
} from "~/components/messages/Inbox";

const DEFAULT_SEARCH = v.parse(messagesSearchSchema, {});

export const Route = createFileRoute("/_app/teach/messages")({
  validateSearch: messagesSearchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => loadMessages(context.queryClient, deps),
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
