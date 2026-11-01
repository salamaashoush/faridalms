import { WORKSPACE_HOME } from "@faridalms/domain/workspace";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { ProductSite } from "~/components/product/ProductSite";
import * as m from "~/i18n/messages";
import { hostView } from "~/utils/host";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    // Each role lands somewhere different, so "/" is a router decision rather
    // than a shared dashboard everybody then navigates away from. A school's
    // website host never reaches here: its root is the website's home page.
    // The platform's own bare domain shows the product to everyone else.
    if (context.auth.workspace)
      throw redirect({ to: WORKSPACE_HOME[context.auth.workspace] });
    if (!hostView().product) throw redirect({ to: "/sign-in" });
  },
  head: () => ({
    meta: [
      { title: m.productTitle() },
      { name: "description", content: m.productDescription() },
      { property: "og:title", content: m.productTitle() },
      { property: "og:description", content: m.productDescription() },
    ],
  }),
  component: ProductSite,
});
