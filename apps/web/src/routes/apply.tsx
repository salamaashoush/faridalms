import { buttonVariants } from "@faridalms/ui/button";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense } from "react";
import * as v from "valibot";

import {
  APPLY_STEPS,
  ApplicationSteps,
  StartApplication,
} from "~/components/admissions/ApplicationForm";
import { AuthLayout } from "~/components/auth/AuthLayout";
import { faceName, PortalHelp } from "~/components/auth/SchoolFace";
import * as m from "~/i18n/messages";
import { draftQuery, myApplicationsQuery } from "~/queries/admissions";
import { faceQueryFor } from "~/queries/portal";
import { currentUserQuery } from "~/queries/user";
import { leaveBareDomain } from "~/utils/bare-domain";

const id = v.pipe(v.string(), v.uuid());

export const Route = createFileRoute("/apply")({
  staticData: { schoolFace: true },
  validateSearch: v.object({
    application: v.optional(id),
    intake: v.optional(id),
    step: v.optional(v.picklist(APPLY_STEPS)),
  }),
  loaderDeps: ({ search }) => ({ application: search.application }),
  beforeLoad: ({ context, location }) =>
    leaveBareDomain(context.auth, location.href),
  loader: async ({ context, deps }) => {
    const query = faceQueryFor(context.auth.school);
    const face = query
      ? await context.queryClient.ensureQueryData(query)
      : null;
    if (!context.auth.isAuthenticated) return { face, applies: false };
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    const applies =
      user.workspace === "family" &&
      user.capabilities.includes("applications:submit");
    if (applies)
      await Promise.all([
        context.queryClient.ensureQueryData(myApplicationsQuery),
        deps.application
          ? context.queryClient.ensureQueryData(draftQuery(deps.application))
          : null,
      ]);
    return { face, applies };
  },
  head: ({ loaderData }) => ({
    meta: loaderData?.face ? [{ title: faceName(loaderData.face) }] : [],
  }),
  component: ApplyPage,
});

/** For someone not signed in: a family registers once, or signs in to carry on. */
function ApplyGate() {
  const { intake } = Route.useSearch();
  return (
    <div className="grid gap-4">
      <h2 className="text-xl font-semibold">{m.applyGateTitle()}</h2>
      <p className="text-muted-foreground">{m.applyGateBody()}</p>
      <div className="flex flex-wrap gap-3">
        <Link to="/register" search={{ intake }} className={buttonVariants()}>
          {m.applyGateRegister()}
        </Link>
        <Link
          to="/sign-in"
          search={{ redirect: intake ? `/apply?intake=${intake}` : "/apply" }}
          className={buttonVariants({ variant: "outline" })}
        >
          {m.applyGateSignIn()}
        </Link>
      </div>
    </div>
  );
}

function NotFamily() {
  return (
    <div className="grid gap-3">
      <h2 className="text-xl font-semibold">{m.applyNotFamilyTitle()}</h2>
      <p className="text-muted-foreground">{m.applyNotFamilyBody()}</p>
      <Link to="/" className={buttonVariants({ variant: "outline" })}>
        {m.applyNotFamilyHome()}
      </Link>
    </div>
  );
}

function Flow() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  if (!search.application)
    return (
      <StartApplication
        intakeId={search.intake}
        onStarted={(application) =>
          void navigate({ search: { application, step: "child" } })
        }
      />
    );
  return (
    <ApplicationSteps
      key={search.application}
      applicationId={search.application}
      step={search.step ?? "child"}
      onStep={(step) =>
        void navigate({ search: (previous) => ({ ...previous, step }) })
      }
      onSent={() =>
        void navigate({ search: { application: search.application } })
      }
    />
  );
}

/**
 * The portal's apply page, the app's own in the school's name and colour.
 * A family that is not signed in is pointed to register or sign in first.
 */
function ApplyPage() {
  const { face, applies } = Route.useLoaderData();
  const signedIn = Route.useRouteContext().auth.isAuthenticated;
  const { application } = Route.useSearch();
  const mine = useQuery({ ...myApplicationsQuery, enabled: applies }).data;
  const body = !signedIn ? (
    <ApplyGate />
  ) : applies && mine ? (
    <Suspense fallback={null}>
      <Flow />
    </Suspense>
  ) : (
    <NotFamily />
  );
  return (
    <AuthLayout face={face} wide={Boolean(application)}>
      {body}
      <PortalHelp face={face} topic="apply" />
    </AuthLayout>
  );
}
