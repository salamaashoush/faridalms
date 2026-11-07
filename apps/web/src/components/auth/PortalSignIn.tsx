import { AuthHeading } from "@faridalms/ui/system/auth-layout";
import { getRouteApi } from "@tanstack/react-router";

import * as m from "~/i18n/messages";
import { bareHref } from "~/utils/host";

import { faceName, PortalHelp } from "./SchoolFace";
import { SignInForm } from "./SignInForm";

const auth = getRouteApi("/_auth");

export interface PortalSignInProps {
  redirect?: string;
}

/** Sign-in on a school's own portal, which welcomes people in the school's name. */
export function PortalSignIn({ redirect }: PortalSignInProps) {
  const face = auth.useLoaderData();
  return (
    <>
      {face ? (
        <AuthHeading
          title={m.portalWelcome({ school: faceName(face) })}
          lead={m.portalSignInLead()}
        />
      ) : (
        <AuthHeading title={m.authSignInTitle()} lead={m.authSignInBody()} />
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
