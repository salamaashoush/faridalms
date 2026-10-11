import {
  INVITE_DAYS,
  INVITE_SECRET,
  MIN_PASSWORD,
} from "@faridalms/domain/first-sign-in";
import { Button, buttonVariants } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CircleCheck, Clock, LoaderCircle, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as v from "valibot";

import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/app/field";
import { AuthLayout } from "~/components/auth/AuthLayout";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { acceptInvite, readInvite } from "~/server/auth";

export const Route = createFileRoute("/welcome")({
  validateSearch: v.object({ school: v.optional(v.string()) }),
  head: () => ({ meta: [{ name: "referrer", content: "no-referrer" }] }),
  component: WelcomePage,
});

function isTooMany(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "TOO_MANY_REQUESTS"
  );
}

function Notice({
  tone,
  icon: Icon,
  title,
  body,
  spinning = false,
}: {
  tone: "primary" | "warning";
  icon: typeof Clock;
  title: string;
  body?: string;
  spinning?: boolean;
}) {
  return (
    <div className="grid justify-items-start gap-4">
      <span
        aria-hidden
        className={
          tone === "warning"
            ? "grid size-12 place-items-center rounded-full bg-warning/20 text-warning-foreground dark:text-warning"
            : "grid size-12 place-items-center rounded-full bg-primary/15 text-primary"
        }
      >
        <Icon className={spinning ? "size-6 animate-spin" : "size-6"} />
      </span>
      <div className="grid gap-2">
        <h1
          role={tone === "warning" ? "alert" : "status"}
          className="text-2xl leading-8 font-semibold"
        >
          {title}
        </h1>
        {body ? <p className="text-muted-foreground">{body}</p> : null}
      </div>
    </div>
  );
}

/**
 * Where the link in a guardian's email lands: they choose the password
 * their child signs in with. The secret rides in the fragment, which the
 * browser never sends to a server or puts in a referrer, and it leaves the
 * address bar and history as soon as the page has read it.
 */
function WelcomePage() {
  const { school } = Route.useSearch();
  const read = useServerFn(readInvite);
  const accept = useServerFn(acceptInvite);
  const secret = useRef("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [errors, setErrors] = useState<{ password?: string; again?: string }>(
    {},
  );
  const invite = useMutation({
    meta: { inlineError: true },
    mutationFn: async () => {
      if (!school || !INVITE_SECRET.test(secret.current))
        throw new Error("auth.invalid_invite");
      return read({ data: { school, secret: secret.current } });
    },
  });
  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      accept({
        data: { school: school ?? "", secret: secret.current, password },
      }),
  });
  const open = invite.mutate;
  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    // The effect can run again once the fragment is gone; the link it read
    // the first time is the one being opened.
    if (!fragment && secret.current) return;
    secret.current = fragment;
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );
    open();
  }, [open]);

  const failed = invite.error ?? save.error;
  const holder = invite.data;
  const name = holder ? inLocale(holder.name.en, holder.name.ar) : "";
  const signIn = (
    <Link to="/sign-in" className={buttonVariants({ variant: "outline" })}>
      {m.welcomeSignIn()}
    </Link>
  );
  return (
    <AuthLayout>
      {failed ? (
        <div className="grid justify-items-start gap-6">
          {isTooMany(failed) ? (
            <Notice tone="warning" icon={Clock} title={m.welcomeTooMany()} />
          ) : (
            <Notice
              tone="warning"
              icon={TriangleAlert}
              title={m.welcomeInvalidTitle()}
              body={m.welcomeInvalidBody({ days: INVITE_DAYS })}
            />
          )}
          {signIn}
        </div>
      ) : save.data ? (
        <div className="grid justify-items-start gap-6">
          <Notice
            tone="primary"
            icon={CircleCheck}
            title={m.welcomeDoneTitle()}
            body={m.welcomeDoneBody({
              name,
              loginName: save.data.loginName,
            })}
          />
          {signIn}
        </div>
      ) : holder ? (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const found: typeof errors = {};
            if (password.length < MIN_PASSWORD)
              found.password = m.validationMinLength({ count: MIN_PASSWORD });
            else if (again !== password)
              found.again = m.validationPasswordMismatch();
            setErrors(found);
            if (Object.keys(found).length === 0) save.mutate();
          }}
        >
          <div className="mb-8">
            <h1 className="mb-2 text-[32px] leading-10 font-semibold text-foreground">
              {m.welcomeTitle({ name })}
            </h1>
            <p className="text-muted-foreground">{m.welcomeBody({ name })}</p>
          </div>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="welcome-login">
                {m.accountLoginName()}
              </FieldLabel>
              <Input
                id="welcome-login"
                readOnly
                dir="ltr"
                autoComplete="username"
                value={holder.loginName}
              />
            </Field>
            <Field data-invalid={Boolean(errors.password)}>
              <FieldLabel htmlFor="welcome-password">
                {m.signInNewPassword()}
              </FieldLabel>
              <Input
                id="welcome-password"
                type="password"
                dir="ltr"
                autoComplete="new-password"
                aria-invalid={Boolean(errors.password)}
                aria-describedby="welcome-password-hint"
                value={password}
                onChange={(event) => {
                  setErrors({});
                  setPassword(event.target.value);
                }}
              />
              {errors.password ? (
                <FieldError errors={[{ message: errors.password }]} />
              ) : (
                <p
                  id="welcome-password-hint"
                  className="text-xs text-muted-foreground"
                >
                  {m.signInPasswordHint({ count: MIN_PASSWORD })}
                </p>
              )}
            </Field>
            <Field data-invalid={Boolean(errors.again)}>
              <FieldLabel htmlFor="welcome-again">
                {m.welcomeConfirm()}
              </FieldLabel>
              <Input
                id="welcome-again"
                type="password"
                dir="ltr"
                autoComplete="new-password"
                aria-invalid={Boolean(errors.again)}
                value={again}
                onChange={(event) => {
                  setErrors({});
                  setAgain(event.target.value);
                }}
              />
              {errors.again ? (
                <FieldError errors={[{ message: errors.again }]} />
              ) : null}
            </Field>
            <Button type="submit" className="w-full" disabled={save.isPending}>
              {save.isPending ? m.welcomeSaving() : m.welcomeSubmit()}
            </Button>
          </FieldGroup>
        </form>
      ) : (
        <Notice
          tone="primary"
          icon={LoaderCircle}
          title={m.welcomeReading()}
          spinning
        />
      )}
    </AuthLayout>
  );
}
