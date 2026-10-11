import { MIN_PASSWORD } from "@faridalms/domain/first-sign-in";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { TextField } from "~/components/system/field";
import { SheetForm } from "~/components/system/SheetForm";
import * as m from "~/i18n/messages";
import { changeOwnPassword } from "~/server/auth";
import { getMessageFromError } from "~/utils/error";

/**
 * A person changes their own password, proving who they are with the one
 * they have. A wrong current password is said on its field; anything else
 * the server refuses is said above the form.
 */
export function ChangePassword({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [errors, setErrors] = useState<{
    current?: string;
    password?: string;
    again?: string;
  }>({});
  const mutation = useMutation({
    mutationFn: () => changeOwnPassword({ data: { current, password } }),
    meta: { inlineError: true },
  });
  const wrong =
    mutation.error instanceof Error &&
    mutation.error.message === "auth.wrong_password";
  return (
    <SheetForm
      open
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.passwordChange()}
      pending={mutation.isPending}
      error={
        mutation.error && !wrong ? getMessageFromError(mutation.error) : null
      }
      onSubmit={async () => {
        const found: typeof errors = {};
        if (!current) found.current = m.validationRequired();
        if (password.length < MIN_PASSWORD)
          found.password = m.validationMinLength({ count: MIN_PASSWORD });
        else if (again !== password)
          found.again = m.validationPasswordMismatch();
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        await mutation.mutateAsync().then(
          () => {
            toast.success(m.passwordChanged());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <TextField
        id="password-current"
        label={m.passwordCurrent()}
        type="password"
        dir="ltr"
        width="name"
        autoComplete="current-password"
        value={current}
        onChange={(event) => {
          setErrors((found) => ({ ...found, current: undefined }));
          mutation.reset();
          setCurrent(event.target.value);
        }}
        errors={
          errors.current
            ? [errors.current]
            : wrong
              ? [m.errorWrongPassword()]
              : undefined
        }
      />
      <TextField
        id="password-new"
        label={m.signInNewPassword()}
        hint={m.signInPasswordHint({ count: MIN_PASSWORD })}
        type="password"
        dir="ltr"
        width="name"
        autoComplete="new-password"
        value={password}
        onChange={(event) => {
          setErrors((found) => ({ ...found, password: undefined }));
          setPassword(event.target.value);
        }}
        errors={errors.password ? [errors.password] : undefined}
      />
      <TextField
        id="password-again"
        label={m.welcomeConfirm()}
        type="password"
        dir="ltr"
        width="name"
        autoComplete="new-password"
        value={again}
        onChange={(event) => {
          setErrors((found) => ({ ...found, again: undefined }));
          setAgain(event.target.value);
        }}
        errors={errors.again ? [errors.again] : undefined}
      />
    </SheetForm>
  );
}
