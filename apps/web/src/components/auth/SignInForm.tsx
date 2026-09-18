import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useHydrated } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/app/field";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import * as m from "~/i18n/messages";
import { loginSchema } from "~/schema/auth";
import { login } from "~/server/auth";

const DEMO_PASSWORD = "northwind1234";

const DEMO_ACCOUNTS = [
  { email: "admin@example.com", label: () => m.roleAdmin() },
  { email: "teacher@example.com", label: () => m.roleTeacher() },
  { email: "parent@example.com", label: () => m.roleParent() },
  { email: "omar@example.com", label: () => m.roleStudent() },
];

export function SignInForm() {
  const hydrated = useHydrated();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { mutateAsync } = useMutation({
    mutationFn: useServerFn(login),
    mutationKey: ["user/login"],
    onSuccess: async () => {
      toast(m.authSignInSuccessTitle(), {
        description: m.authSignInSuccessMessage(),
      });
      // Identity changed: drop anything the previous session left behind.
      queryClient.clear();
      await router.invalidate();
      // "/" resolves to the landing route for whichever role just signed in.
      await router.navigate({ to: "/" });
    },
  });

  const form = useForm({
    defaultValues: { school: "northwind", email: "", password: "" },
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
        <form.Field name="school">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="school">{m.authSchoolCode()}</FieldLabel>
              <Input
                disabled={!hydrated}
                id="school"
                name="school"
                autoComplete="organization"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                aria-describedby="school-hint"
              />
              <p id="school-hint" className="text-xs text-muted-foreground">
                {m.authSchoolHint()}
              </p>
            </Field>
          )}
        </form.Field>
        <form.Field name="email">
          {(field) => {
            const invalid =
              field.state.meta.isTouched && !field.state.meta.isValid;
            return (
              <Field data-invalid={invalid}>
                <FieldLabel htmlFor={field.name}>
                  {m.authSignInFormEmail()}
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
                key={account.email}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  form.setFieldValue("email", account.email);
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
