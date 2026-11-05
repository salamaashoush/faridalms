import { getRouteApi } from "@tanstack/react-router";

import * as m from "~/i18n/messages";
import { bareHref } from "~/utils/host";

import { faceName, PortalHeading, PortalHelp } from "./SchoolFace";
import { SignInForm } from "./SignInForm";

const auth = getRouteApi("/_auth");

/** Sign-in on a school's own portal, which welcomes people in the school's name. */
export function PortalSignIn({ redirect }: { redirect?: string }) {
  const face = auth.useLoaderData();
  return (
    <>
      {face ? (
        <PortalHeading
          title={m.portalWelcome({ school: faceName(face) })}
          lead={m.portalSignInLead()}
        />
      ) : (
        <PortalHeading title={m.authSignInTitle()} lead={m.authSignInBody()} />
      )}
      <SignInForm redirect={redirect} />
      <p className="mt-8 text-center text-sm text-muted-foreground">
        <a
          href={bareHref("/another-account")}
          className="text-primary underline-offset-4 hover:underline"
        >
          {m.authAnotherAccount()}
        </a>
      </p>
      <PortalHelp face={face} topic="sign-in" />
    </>
  );
}
