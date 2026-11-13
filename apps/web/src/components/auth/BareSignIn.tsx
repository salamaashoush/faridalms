import { Button } from "@faridalms/ui/button";
import { Field, FieldGroup, FieldLabel } from "@faridalms/ui/field";
import { Input } from "@faridalms/ui/input";
import { FieldError } from "@faridalms/ui/system/form-field";
import { useMutation } from "@tanstack/react-query";
import { Link, useHydrated } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import * as v from "valibot";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { loginSchema } from "~/schema/auth";
import { discoverSignIn } from "~/server/auth";
import { getMessageFromError } from "~/utils/error";

import { DEMO_PASSWORD, demoAccounts } from "./demo-accounts";
import { useHumanCheck } from "./HumanCheck";

type School = { slug: string; nameEn: string | null; nameAr: string | null };

const loginName = loginSchema.entries.loginName;

/**
 * Sign-in on the bare portal domain, where nobody names a school: the email
 * first, then the password, whatever the email was, since nothing is looked
 * up between the two. The school is found once the password is right, and
 * the browser goes on to sign in on that school's own portal.
 */
export function BareSignIn() {
  const hydrated = useHydrated();
  const [step, setStep] = useState<"name" | "password">("name");
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [schools, setSchools] = useState<School[] | null>(null);
  const discover = useServerFn(discoverSignIn);
  const human = useHumanCheck("sign_in");
  const signIn = useMutation({
    meta: { inlineError: true },
    mutationFn: (school?: string) =>
      discover({
        data: { loginName: name, password, school, human: human.token },
      }),
    onSettled: () => human.spend(),
    onSuccess: (answer) => {
      if ("href" in answer) window.location.assign(answer.href);
      else setSchools(answer.schools);
    },
  });

  const toPassword = () => {
    const checked = v.safeParse(loginName, name);
    if (!checked.success) {
      setNameError(m.validationLoginName());
      return;
    }
    setName(checked.output);
    setNameError(null);
    setStep("password");
  };

  if (schools)
    return (
      <div className="grid gap-6">
        <div>
          <h1 className="mb-2 text-[32px] leading-10 font-semibold text-foreground">
            {m.bareChooseTitle()}
          </h1>
          <p className="text-muted-foreground">{m.bareChooseBody()}</p>
        </div>
        <ul className="grid gap-2">
          {schools.map((school) => (
            <li key={school.slug}>
              <button
                type="button"
                disabled={signIn.isPending || !human.ready}
                onClick={() => signIn.mutate(school.slug)}
                className="flex min-h-14 w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-start hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span
                  dir="auto"
                  className="min-w-0 flex-1 truncate font-medium"
                >
                  {inLocale(school.nameEn, school.nameAr)}
                </span>
                <ChevronRight
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground rtl:rotate-180"
                />
              </button>
            </li>
          ))}
        </ul>
        {human.widget}
        {signIn.error ? (
          <p role="alert" className="text-sm text-destructive">
            {getMessageFromError(signIn.error)}
          </p>
        ) : null}
      </div>
    );

  return (
    <div>
      <div className="mb-8">
        <h1 className="mb-2 text-[32px] leading-10 font-semibold text-foreground">
          {m.authSignInTitle()}
        </h1>
        <p className="text-muted-foreground">
          {step === "name" ? m.bareNameBody() : m.barePasswordBody()}
        </p>
      </div>
      {step === "name" ? (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            toPassword();
          }}
        >
          <FieldGroup>
            <Field data-invalid={nameError !== null}>
              <FieldLabel htmlFor="loginName">
                {m.authSignInFormLogin()}
              </FieldLabel>
              <Input
                disabled={!hydrated}
                id="loginName"
                name="loginName"
                type="text"
                dir="ltr"
                inputMode="email"
                autoComplete="username"
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={nameError !== null}
              />
              {nameError ? <FieldError>{nameError}</FieldError> : null}
            </Field>
            <Button type="submit" className="w-full" disabled={!hydrated}>
              {m.bareNext()}
            </Button>
          </FieldGroup>
        </form>
      ) : (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (password && human.ready) signIn.mutate(undefined);
          }}
        >
          <FieldGroup>
            {/* The name travels with the password, as browsers expect of a
                sign-in form, so a password manager offers the right one. */}
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={name}
              readOnly
              hidden
            />
            <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <span dir="ltr" className="truncate text-sm">
                {name}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStep("name");
                  setPassword("");
                  signIn.reset();
                }}
              >
                {m.bareChangeName()}
              </Button>
            </div>
            <Field data-invalid={signIn.isError}>
              <FieldLabel htmlFor="password">
                {m.authSignInFormPassword()}
              </FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={signIn.isError}
              />
              {signIn.error ? (
                <p role="alert" className="text-sm text-destructive">
                  {getMessageFromError(signIn.error)}
                </p>
              ) : null}
              <Link
                to="/forgot-password"
                className="justify-self-end text-sm text-primary underline-offset-4 hover:underline"
              >
                {m.authForgotPassword()}
              </Link>
            </Field>
            {human.widget}
            <Button
              type="submit"
              className="w-full"
              disabled={signIn.isPending || !password || !human.ready}
            >
              {signIn.isPending
                ? m.authSignInFormSubmitting()
                : m.authSignInFormSubmit()}
            </Button>
          </FieldGroup>
        </form>
      )}

      {import.meta.env.DEV && step === "name" && (
        <div className="mt-8 rounded-lg border border-dashed border-border p-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {m.authDemoAccounts()}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {m.authDemoHint({ password: DEMO_PASSWORD })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {demoAccounts(null).map((account) => (
              <Button
                key={account.loginName}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setName(account.loginName);
                  setPassword(DEMO_PASSWORD);
                  setStep("password");
                }}
              >
                {account.label()}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
