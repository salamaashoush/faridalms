import { createFileRoute, redirect } from "@tanstack/react-router";

import { movedAddress } from "~/utils/moved-addresses";

export const Route = createFileRoute("/teach/$")({
  beforeLoad: ({ location }) => {
    throw redirect({
      href: movedAddress("teach", location.pathname, location.searchStr),
    });
  },
});
