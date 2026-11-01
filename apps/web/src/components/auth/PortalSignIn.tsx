import { getRouteApi } from "@tanstack/react-router";

import * as m from "~/i18n/messages";
import { bareHref } from "~/utils/host";

import { SignInForm } from "./SignInForm";

const auth = getRouteApi("/_auth");

/**
 * Sign-in on a school's own portal, which names the school. Inside the
 * school's portal page the Sign-in section says the words over the form;
 * the platform's own page, drawn when the school's cannot be read, says
 * its own.
 */
export function PortalSignIn() {
  const face = auth.useLoaderData();
  return (
    <>
      {face ? null : (
        <div className="mb-8">
          <h1 className="mb-2 text-[32px] leading-10 font-semibold text-foreground">
            {m.authSignInTitle()}
          </h1>
          <p className="text-muted-foreground">{m.authSignInBody()}</p>
        </div>
      )}
      <SignInForm />
      <p className="mt-8 text-center text-sm text-muted-foreground">
        <a
          href={bareHref("/another-account")}
          className="text-primary underline-offset-4 hover:underline"
        >
          {m.authAnotherAccount()}
        </a>
      </p>
    </>
  );
}
