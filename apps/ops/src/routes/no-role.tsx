import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/no-role")({
  beforeLoad: ({ context }) => {
    if (context.access && context.access.roles.length > 0)
      throw redirect({ to: "/" });
  },
  component: NoRole,
});

function NoRole() {
  return (
    <div className="mx-auto grid max-w-sm gap-4 pt-16 text-center">
      <h1 className="text-2xl font-semibold">No role yet</h1>
      <p className="text-sm text-muted-foreground">
        You are signed in, but the console has not given you a role. Ask an
        owner of the console to give you one on its Operators page, then reload
        this page.
      </p>
    </div>
  );
}
