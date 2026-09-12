import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import {
  MessagesPage,
  messagesSearchSchema,
} from "~/components/communication/MessagesPage";
import { messagesQuery } from "~/queries/school";

export const Route = createFileRoute("/_app/family/messages")({
  validateSearch: (search) => v.parse(messagesSearchSchema, search),
  loaderDeps: ({ search }) => ({ folder: search.folder, q: search.q }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(messagesQuery(deps)),
  component: RouteComponent,
});

function RouteComponent() {
  return <MessagesPage search={Route.useSearch()} />;
}
