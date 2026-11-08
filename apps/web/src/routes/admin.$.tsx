import { createFileRoute, redirect } from "@tanstack/react-router";

import { movedAddress } from "~/utils/moved-addresses";

export const Route = createFileRoute("/admin/$")({
  beforeLoad: ({ location }) => {
    throw redirect({
      href: movedAddress("admin", location.pathname, location.searchStr),
    });
  },
});
