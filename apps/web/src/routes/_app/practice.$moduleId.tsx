import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import * as v from "valibot";

import { BreadcrumbCurrent } from "~/components/app/WorkspaceBreadcrumb";
import { PracticePlayer } from "~/components/learning/Practice";
import * as m from "~/i18n/messages";
import { practiceSetQuery } from "~/queries/learning";

const searchSchema = v.object({
  round: v.fallback(
    v.optional(
      v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(50)),
      0,
    ),
    0,
  ),
});

export const Route = createFileRoute("/_app/practice/$moduleId")({
  staticData: {
    trail: <PracticeTrail />,
    section: ["/me/modules"],
  },
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams({ round: 0 })] },
  loaderDeps: ({ search }) => ({ round: search.round }),
  loader: ({ context, params, deps }) =>
    context.queryClient.ensureQueryData(
      practiceSetQuery(params.moduleId, deps.round),
    ),
  component: PracticePage,
});

function PracticeTrail() {
  const { moduleId } = Route.useParams();
  const { round } = Route.useSearch();
  const data = useSuspenseQuery(practiceSetQuery(moduleId, round)).data;
  return (
    <BreadcrumbCurrent>
      {m.lrnPracticeOf({ module: data.module.title })}
    </BreadcrumbCurrent>
  );
}

function PracticePage() {
  const { moduleId } = Route.useParams();
  const { round } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <PracticePlayer
      key={round}
      moduleId={moduleId}
      round={round}
      onRound={(next) => void navigate({ search: { round: next } })}
    />
  );
}
