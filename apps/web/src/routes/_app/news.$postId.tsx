import { createFileRoute } from "@tanstack/react-router";

import {
  BroadcastRecord,
  BroadcastTrail,
} from "~/components/broadcasts/BroadcastRecord";
import { newsPostQuery } from "~/queries/news";

export const Route = createFileRoute("/_app/news/$postId")({
  staticData: { trail: <NewsTrail />, section: "/news" },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(newsPostQuery(params.postId)),
  component: NewsPostPage,
});

function NewsTrail() {
  const { postId } = Route.useParams();
  return <BroadcastTrail kind="news" id={postId} />;
}

function NewsPostPage() {
  const { postId } = Route.useParams();
  return <BroadcastRecord kind="news" id={postId} />;
}
