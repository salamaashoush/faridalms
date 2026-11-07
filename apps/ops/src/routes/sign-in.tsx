import { buttonVariants } from "@faridalms/ui/button";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { CircleAlert } from "lucide-react";
import * as v from "valibot";

import { AuthPage } from "../components/AuthPage";

const REASON: Record<string, string> = {
  expired: "The sign-in took too long. Try again.",
  failed: "The identity provider did not confirm the sign-in. Try again.",
  not_fresh:
    "The identity provider did not ask you to sign in again, which this action needs. Try again.",
  not_operator:
    "This account is not one the console lets in: it is not in the operators' group, or its email is not on the console's list or not verified. Ask whoever runs the console to add you.",
};

export const Route = createFileRoute("/sign-in")({
  validateSearch: v.object({ error: v.optional(v.string()) }),
  beforeLoad: ({ context }) => {
    if (context.operator) throw redirect({ to: "/" });
  },
  component: SignIn,
});

function SignIn() {
  const { error } = Route.useSearch();
  return (
    <AuthPage
      title="Sign in"
      lead="Use your company account. The console lets in the people its owners have added."
    >
      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm leading-5 text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {REASON[error] ?? REASON.failed}
        </p>
      ) : null}
      <a
        href="/auth/login"
        className={buttonVariants({ size: "lg", className: "w-full" })}
      >
        Sign in
      </a>
    </AuthPage>
  );
}
