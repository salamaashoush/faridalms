import { createFileRoute, redirect } from "@tanstack/react-router";

import { AuthCard } from "../components/AuthCard";

export const Route = createFileRoute("/no-role")({
  beforeLoad: ({ context }) => {
    if (context.access && context.access.roles.length > 0)
      throw redirect({ to: "/" });
  },
  component: NoRole,
});

function NoRole() {
  return (
    <AuthCard
      title="No role yet"
      description="You are signed in, but the console has not given you a role. Ask an owner of the console to give you one on its Operators page, then reload this page."
    />
  );
}
