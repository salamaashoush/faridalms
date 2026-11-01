import { RESET_MINUTES } from "@faridalms/domain/first-sign-in";
import { Button, buttonVariants } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Link, useHydrated } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { MailCheck } from "lucide-react";

import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/app/field";
import * as m from "~/i18n/messages";
import { forgotPasswordSchema } from "~/schema/auth";
import { discoverReset, requestPasswordReset } from "~/server/auth";
import { getMessageFromError } from "~/utils/error";
import { hostView } from "~/utils/host";

import { useHumanCheck } from "./HumanCheck";

/**
 * Asks for a link that replaces a forgotten password. What comes back reads
 * the same whether or not the name has an account, so the page never says
 * which names exist.
 */
export function ForgotPasswordForm() {
  const hydrated = useHydrated();
  const everySchool = useServerFn(discoverReset);
  const thisSchool = useServerFn(requestPasswordReset);
  const bare = hostView().bare;
  const human = useHumanCheck("reset", bare);
  const request = useMutation({
    // The bare portal domain asks every school holding the name; a
    // school's portal asks only itself.
    mutationFn: (loginName: string) =>
      bare
        ? everySchool({ data: { loginName, human: human.token } })
        : thisSchool({ data: { loginName } }),
    onSettled: () => human.spend(),
    meta: { inlineError: true },
  });
  const form = useForm({
    defaultValues: { loginName: "" },
    validators: { onSubmit: forgotPasswordSchema },
    onSubmit: async ({ value }) => {
      await request.mutateAsync(value.loginName).catch(() => undefined);
    },
  });

  if (request.isSuccess)
    return (
      <div aria-live="polite" className="grid justify-items-start gap-6">
        <span
          aria-hidden
          className="grid size-12 place-items-center rounded-full bg-primary/15 text-primary"
        >
          <MailCheck className="size-6" />
        </span>
        <div className="grid gap-2">
          <h1 className="text-2xl leading-8 font-semibold">
            {m.forgotSentTitle()}
          </h1>
          <p className="text-muted-foreground">
            {m.forgotSentBody({ minutes: RESET_MINUTES })}
          </p>
        </div>
        <Link to="/sign-in" className={buttonVariants({ variant: "outline" })}>
          {m.forgotBack()}
        </Link>
      </div>
    );

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="mb-8">
        <h1 className="mb-2 text-[32px] font-semibold text-foreground">
          {m.forgotTitle()}
        </h1>
        <p className="text-muted-foreground">{m.forgotBody()}</p>
      </div>
      <FieldGroup>
        <form.Field name="loginName">
          {(field) => {
            const invalid =
              field.state.meta.isTouched && !field.state.meta.isValid;
            return (
              <Field data-invalid={invalid}>
                <FieldLabel htmlFor={field.name}>
                  {m.authSignInFormLogin()}
                </FieldLabel>
                <Input
                  disabled={!hydrated}
                  id={field.name}
                  name={field.name}
                  type="text"
                  dir="ltr"
                  inputMode="email"
                  autoComplete="username"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={invalid}
                />
                {invalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
        </form.Field>
        {request.error ? (
          <p role="alert" className="text-sm text-destructive">
            {getMessageFromError(request.error)}
          </p>
        ) : null}
        {bare ? human.widget : null}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || !hydrated || (bare && !human.ready)}
            >
              {isSubmitting ? m.forgotSending() : m.forgotSubmit()}
            </Button>
          )}
        </form.Subscribe>
        <Link
          to="/sign-in"
          className="justify-self-center text-sm text-primary underline-offset-4 hover:underline"
        >
          {m.forgotBack()}
        </Link>
      </FieldGroup>
    </form>
  );
}
