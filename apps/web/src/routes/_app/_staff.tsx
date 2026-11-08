import { WORKSPACE_HOME } from "@faridalms/domain/workspace";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/_staff")({
  beforeLoad: ({ context }) => {
    // The workspace is the session's context, and only staff pages sit under
    // this pathless layout. Server functions authorise their own data, but
    // without this a parent opening /classes gets the chrome, the headings
    // and a page full of failed requests instead of a clean bounce. Which
    // staff page a person may open is the page's own `requirePage`.
    if (context.auth.workspace !== "staff") {
      throw redirect({
        to: context.auth.workspace
          ? WORKSPACE_HOME[context.auth.workspace]
          : "/sign-in",
      });
    }
  },
  component: Outlet,
});
