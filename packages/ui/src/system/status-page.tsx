import type { ErrorComponentProps } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { rootRouteId, useMatch, useRouter } from "@tanstack/react-router";
import {
  Compass,
  LockKeyhole,
  LogIn,
  RefreshCw,
  TriangleAlert,
  WifiOff,
} from "lucide-react";

import { Button } from "../button";
import { ButtonLink } from "./button-link";
import { useDesignSystem, useSystemStrings } from "./provider";

export interface StatusPageProps {
  /** Shown large and muted above the title. Omitted for non-HTTP failures. */
  code?: string;
  icon?: ReactNode;
  title: string;
  description: string;
  actions?: ReactNode;
  children?: ReactNode;
}

/** A whole page that says why there is nothing to show, and where to go. */
export function StatusPage({
  code,
  icon,
  title,
  description,
  actions,
  children,
}: StatusPageProps) {
  return (
    <div className="grid min-h-[calc(100svh-8rem)] place-items-center p-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        {icon ? (
          <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
            {icon}
          </span>
        ) : null}
        {code ? (
          <p className="text-5xl font-semibold tracking-tight text-muted-foreground/40 tabular-nums">
            {code}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground">{description}</p>
        {children}
        {actions ? (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * What a route shows when it fails, by what the reader can do about it: a
 * page they may not open or that is gone offers the way out and no retry,
 * an ended session offers signing in, and only a break nobody foresaw
 * keeps its cause to hand. Below the root a reader can go back to where
 * they were; at the root there is only home.
 */
export function ErrorPage({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const { strings, errorMessage, errorKind } = useDesignSystem();
  const isRoot = useMatch({
    strict: false,
    select: (state) => state.id === rootRouteId,
  });
  const kind = errorKind(error);
  const retry = (
    <Button
      onClick={() => {
        reset();
        void router.invalidate();
      }}
    >
      <RefreshCw className="size-4" />
      {strings.errorRetry}
    </Button>
  );
  const leave = (primary: boolean) => (
    <>
      <ButtonLink variant={primary ? "default" : "outline"} to="/">
        {strings.goHome}
      </ButtonLink>
      {isRoot ? null : (
        <Button variant="outline" onClick={() => router.history.back()}>
          {strings.goBack}
        </Button>
      )}
    </>
  );
  if (kind === "forbidden")
    return (
        <StatusPage
          icon={<LockKeyhole className="size-5" />}
          title={strings.errorForbiddenTitle}
          description={strings.errorForbiddenBody}
          actions={leave(true)}
        />
      );
  if (kind === "missing")
    return (
        <StatusPage
          icon={<Compass className="size-5" />}
          title={strings.errorMissingTitle}
          description={strings.errorMissingBody}
          actions={leave(true)}
        />
      );
  if (kind === "signed_out")
    return (
        <StatusPage
          icon={<LogIn className="size-5" />}
          title={strings.errorSignedOutTitle}
          description={strings.errorSignedOutBody}
          actions={
            // Loading the address afresh sends a signed-out reader to sign
            // in and brings them back to it.
            <Button onClick={() => window.location.reload()}>
              {strings.errorSignIn}
            </Button>
          }
        />
      );
  if (kind === "offline")
    return (
        <StatusPage
          icon={<WifiOff className="size-5" />}
          title={strings.errorOfflineTitle}
          description={strings.errorOfflineBody}
          actions={retry}
        />
      );
  return (
        <StatusPage
          icon={<TriangleAlert className="size-5" />}
          title={strings.errorTitle}
          description={strings.errorBody}
          actions={
            <>
              {retry}
              {isRoot ? (
                <ButtonLink variant="outline" to="/">
                  {strings.goHome}
                </ButtonLink>
              ) : (
                <Button variant="outline" onClick={() => router.history.back()}>
                  {strings.goBack}
                </Button>
              )}
            </>
          }
        >
          {/* Useful to a developer, meaningless to a user: available, not in their face. */}
          <details className="w-full rounded-md border border-border bg-muted/40 text-start">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">
              {strings.errorDetails}
            </summary>
            <pre className="overflow-x-auto border-t border-border px-4 py-3 text-xs whitespace-pre-wrap text-muted-foreground">
              {errorMessage(error)}
            </pre>
          </details>
        </StatusPage>
      );
}

/** What an address that leads nowhere shows. */
export function NotFoundPage() {
  const router = useRouter();
  const strings = useSystemStrings();
  return (
    <StatusPage
      code="404"
      icon={<Compass className="size-5" />}
      title={strings.notFoundTitle}
      description={strings.notFoundBody}
      actions={
        <>
          <ButtonLink to="/">{strings.goHome}</ButtonLink>
          <Button variant="outline" onClick={() => router.history.back()}>
            {strings.goBack}
          </Button>
        </>
      }
    />
  );
}
