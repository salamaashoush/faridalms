import { INVITE_DAYS, loginNameSchema } from "@faridalms/domain/first-sign-in";
import { Button } from "@faridalms/ui/button";
import { ConfirmDialog } from "@faridalms/ui/system/confirm-dialog";
import { TextField } from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Mail, Power } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import * as m from "~/i18n/messages";
import { saveSignIn, sendSignInLink, setSignInState } from "~/server/students";
import { getMessageFromError } from "~/utils/error";

import { AccountSection } from "./record-parts";

interface Account {
  state: string;
  loginName: string | null;
  lastSignInAt: string | null;
}

const MIN_PASSWORD = 15;

interface SignInSheetProps {
  userId: string;
  name: string;
  account: Account | null;
  suggestedLogin: string;
  /** Type a password for them, or email them a link to choose their own. */
  way: "password" | "link";
  open: boolean;
  onClose: () => void;
}

function SignInSheet({
  userId,
  name,
  account,
  suggestedLogin,
  way,
  open,
  onClose,
}: SignInSheetProps) {
  const queryClient = useQueryClient();
  const creating = !account?.loginName;
  const linking = way === "link";
  const [loginName, setLoginName] = useState(
    account?.loginName ?? suggestedLogin,
  );
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ login?: string; password?: string }>(
    {},
  );
  const mutation = useMutation({
    mutationFn: async () => {
      if (linking)
        await sendSignInLink({ data: { userId, loginName: loginName.trim() } });
      else
        await saveSignIn({
          data: { userId, loginName: loginName.trim(), password },
        });
    },
    meta: { inlineError: true },
  });
  const failure = mutation.error ? getMessageFromError(mutation.error) : null;
  const taken =
    mutation.error instanceof Error &&
    mutation.error.message === "login_identity.login_name_taken";
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={
        linking
          ? m.signInSendLink()
          : creating
            ? m.signInCreate()
            : m.signInChange()
      }
      submitLabel={linking ? m.signInSendLinkSubmit() : undefined}
      pending={mutation.isPending}
      error={taken ? null : failure}
      onSubmit={async () => {
        const found: typeof errors = {};
        if (!v.is(loginNameSchema, loginName))
          found.login = m.validationLoginName();
        if (
          !linking &&
          (creating || password) &&
          password.length < MIN_PASSWORD
        )
          found.password = m.validationMinLength({ count: MIN_PASSWORD });
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        await mutation.mutateAsync().then(
          async () => {
            await queryClient.invalidateQueries({ queryKey: ["people"] });
            toast.success(
              linking
                ? m.signInLinkSent({ name })
                : creating
                  ? m.signInCreated({ name })
                  : password
                    ? m.signInPasswordChanged({ name })
                    : m.managementSaved(),
            );
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        {linking
          ? creating
            ? m.signInSendLinkHint({ days: INVITE_DAYS })
            : m.signInSendResetHint({ days: INVITE_DAYS })
          : creating
            ? m.signInCreateHint()
            : m.signInChangeHint()}
      </p>
      <TextField
        id="sign-in-login"
        label={m.accountLoginName()}
        inputMode="email"
        dir="ltr"
        width="name"
        autoComplete="off"
        readOnly={linking && !creating}
        value={loginName}
        onChange={(event) => {
          setErrors((current) => ({ ...current, login: undefined }));
          setLoginName(event.target.value);
        }}
        errors={
          errors.login
            ? [errors.login]
            : taken
              ? [m.signInLoginTaken()]
              : undefined
        }
      />
      {linking ? null : (
        <TextField
          id="sign-in-password"
          label={creating ? m.signInPassword() : m.signInNewPassword()}
          optional={!creating}
          hint={m.signInPasswordHint({ count: MIN_PASSWORD })}
          type="password"
          dir="ltr"
          width="name"
          autoComplete="new-password"
          value={password}
          onChange={(event) => {
            setErrors((current) => ({ ...current, password: undefined }));
            setPassword(event.target.value);
          }}
          errors={errors.password ? [errors.password] : undefined}
        />
      )}
    </SheetForm>
  );
}

export interface SignInSectionProps {
  userId: string;
  name: string;
  account: Account | null;
  manage: boolean;
  suggestedLogin?: string;
  description: string;
  none: string;
  /** An adult may be emailed a link to choose their own password. */
  emailLink?: boolean;
}

/**
 * The record's sign-in: its state, and for someone who manages it, the sheet
 * that opens or changes it and the switch that disables it.
 */
export function SignInSection({
  userId,
  name,
  account,
  manage,
  suggestedLogin = "",
  description,
  none,
  emailLink = false,
}: SignInSectionProps) {
  const queryClient = useQueryClient();
  const [sheet, setSheet] = useState({
    open: false,
    key: 0,
    way: "password" as "password" | "link",
  });
  const [confirming, setConfirming] = useState(false);
  const disabled = account?.state === "disabled";
  const toggle = useMutation({
    mutationFn: () =>
      setSignInState({
        data: { userId, state: disabled ? "active" : "disabled" },
      }),
    meta: { inlineError: true },
  });
  const flip = async () => {
    await toggle.mutateAsync().then(
      async () => {
        await queryClient.invalidateQueries({ queryKey: ["people"] });
        toast.success(
          disabled ? m.signInEnabled({ name }) : m.signInDisabled({ name }),
        );
        setConfirming(false);
      },
      () => undefined,
    );
  };
  const actions = manage ? (
    <>
      {account ? (
        <Button
          type="button"
          variant="ghost"
          className="max-md:h-10"
          disabled={toggle.isPending}
          onClick={() => (disabled ? void flip() : setConfirming(true))}
        >
          <Power aria-hidden />
          {disabled ? m.signInEnable() : m.signInDisable()}
        </Button>
      ) : null}
      {emailLink && !disabled ? (
        <Button
          type="button"
          variant="ghost"
          className="max-md:h-10"
          onClick={() =>
            setSheet((current) => ({
              open: true,
              key: current.key + 1,
              way: "link",
            }))
          }
        >
          <Mail aria-hidden />
          {m.signInSendLink()}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        className="max-md:h-10"
        onClick={() =>
          setSheet((current) => ({
            open: true,
            key: current.key + 1,
            way: "password",
          }))
        }
      >
        <KeyRound aria-hidden />
        {account?.loginName ? m.signInChange() : m.signInCreate()}
      </Button>
    </>
  ) : undefined;
  return (
    <>
      <AccountSection
        account={account}
        description={description}
        none={none}
        action={actions}
      />
      {manage ? (
        <SignInSheet
          key={sheet.key}
          userId={userId}
          name={name}
          account={account}
          suggestedLogin={suggestedLogin}
          way={sheet.way}
          open={sheet.open}
          onClose={() => setSheet((current) => ({ ...current, open: false }))}
        />
      ) : null}
      <ConfirmDialog
        open={confirming}
        title={m.signInDisableTitle({ name })}
        body={m.signInDisableBody({ name })}
        confirmLabel={m.signInDisable()}
        pending={toggle.isPending}
        error={toggle.error ? getMessageFromError(toggle.error) : undefined}
        onConfirm={() => void flip()}
        onCancel={() => {
          toggle.reset();
          setConfirming(false);
        }}
      />
    </>
  );
}
