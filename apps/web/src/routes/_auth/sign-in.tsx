import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { faceName } from "~/components/auth/SchoolFace";
import { SignInForm } from "~/components/auth/SignInForm";
import * as m from "~/i18n/messages";

const auth = getRouteApi("/_auth");

export const Route = createFileRoute("/_auth/sign-in")({
  component: SignInPage,
});

function SignInPage() {
  const { auth: state } = Route.useRouteContext();
  const face = auth.useLoaderData();
  return (
    <>
      <div className="mb-8">
        <h1 className="mb-2 text-[32px] leading-10 font-semibold text-foreground">
          {face ? m.portalSignInTitle() : m.authSignInTitle()}
        </h1>
        <p className="text-muted-foreground">
          {face
            ? m.portalSignInBody({ school: faceName(face) })
            : m.authSignInBody()}
        </p>
      </div>
      <SignInForm school={state.school} schoolFromHost={state.schoolFromHost} />
    </>
  );
}
