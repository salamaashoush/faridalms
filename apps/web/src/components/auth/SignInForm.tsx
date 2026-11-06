import { Button } from "@faridalms/ui/button";
import { Field, FieldGroup, FieldLabel } from "@faridalms/ui/field";
import { Input } from "@faridalms/ui/input";
import { FieldError } from "@faridalms/ui/system/form-field";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Link, useHydrated } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { useSessionChange } from "~/hooks/useSessionChange";
import * as m from "~/i18n/messages";
import { loginSchema } from "~/schema/auth";
import { login } from "~/server/auth";

export const DEMO_PASSWORD = "farida-development-password";

export const DEMO_ACCOUNTS = [
  {
    loginName: "principal.northwind@northwind.example.com",
    label: () => m.roleAdmin(),
  },
  {
    loginName: "teacher1.northwind@northwind.example.com",
    label: () => m.roleTeacher(),
  },
  {
    loginName: "parent1001@northwind.example.com",
    label: () => m.roleParent(),
  },
  {
    loginName: "student1007@northwind.example.com",
    label: () => m.roleStudent(),
  },
];

/** Signs a person in to the school whose portal shows the form. */
export function SignInForm({ redirect }: { redirect?: string } = {}) {
  const hydrated = useHydrated();
  const sessionChanged = useSessionChange();

  const { mutateAsync } = useMutation({
    mutationFn: useServerFn(login),
    mutationKey: ["user/login"],
    onSuccess: async () => {
      toast(m.authSignInSuccessTitle(), {
        description: m.authSignInSuccessMessage(),
      });
      // Back to the page that sent them here; else "/", which resolves to
      // the landing route for whichever role just signed in.
      await sessionChanged(redirect ? { href: redirect } : "/");
    },
  });

  const form = useForm({
    defaultValues: {
      loginName: "",
      password: "",
    },
    // valibot implements Standard Schema, so the schema is accepted directly --
    // no @hookform/resolvers-style adapter package.
    validators: { onSubmit: loginSchema },
    onSubmit: async ({ value }) => {
      await mutateAsync({ data: value });
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
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

        <form.Field name="password">
          {(field) => {
            const invalid =
              field.state.meta.isTouched && !field.state.meta.isValid;
            return (
              <Field data-invalid={invalid}>
                <FieldLabel htmlFor={field.name}>
                  {m.authSignInFormPassword()}
                </FieldLabel>
                <Input
                  disabled={!hydrated}
                  id={field.name}
                  name={field.name}
                  type="password"
                  autoComplete="current-password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={invalid}
                />
                {invalid && <FieldError errors={field.state.meta.errors} />}
                <Link
                  to="/forgot-password"
                  className="justify-self-end text-sm text-primary underline-offset-4 hover:underline"
                >
                  {m.authForgotPassword()}
                </Link>
              </Field>
            );
          }}
        </form.Field>

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || !hydrated}
            >
              {isSubmitting
                ? m.authSignInFormSubmitting()
                : m.authSignInFormSubmit()}
            </Button>
          )}
        </form.Subscribe>
      </FieldGroup>

      {import.meta.env.DEV && (
        <div className="mt-8 rounded-lg border border-dashed border-border p-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {m.authDemoAccounts()}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {m.authDemoHint({ password: DEMO_PASSWORD })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <Button
                key={account.loginName}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  form.setFieldValue("loginName", account.loginName);
                  form.setFieldValue("password", DEMO_PASSWORD);
                }}
              >
                {account.label()}
              </Button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}
