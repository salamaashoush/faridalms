import { Button } from "@faridalms/ui/button";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { LogOut } from "lucide-react";

import { AuthPage } from "../components/AuthPage";

export const Route = createFileRoute("/no-role")({
  beforeLoad: ({ context }) => {
    if (context.access && context.access.roles.length > 0)
      throw redirect({ to: "/" });
  },
  component: NoRole,
});

function NoRole() {
  return (
    <AuthPage
      title="No role yet"
      lead="You are signed in, but the console has not given you a role. Ask an owner of the console to give you one on its Operators page, then reload this page."
    >
      {/* Signing out is a POST, so the session cannot be ended by a link. */}
      <form method="post" action="/auth/logout">
        <Button type="submit" variant="outline" size="lg" className="w-full">
          <LogOut aria-hidden />
          Sign out
        </Button>
      </form>
    </AuthPage>
  );
}
