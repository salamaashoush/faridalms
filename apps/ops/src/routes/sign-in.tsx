import { buttonVariants } from "@faridalms/ui/button";
import { createFileRoute, redirect } from "@tanstack/react-router";
import * as v from "valibot";

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
    <div className="mx-auto grid max-w-sm gap-4 pt-16 text-center">
      <h1 className="text-2xl font-semibold">Operator console</h1>
      <p className="text-sm text-muted-foreground">
        Plans, storage and modules for every school. Sign in with your company
        account.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {REASON[error] ?? REASON.failed}
        </p>
      ) : null}
      <a
        href="/auth/login"
        className={buttonVariants({
          size: "lg",
          className: "justify-self-center",
        })}
      >
        Sign in
      </a>
    </div>
  );
}
