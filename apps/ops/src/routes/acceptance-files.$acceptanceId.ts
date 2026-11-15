import { acceptanceAttachment } from "@faridalms/database/business/agreements";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { requireArea } from "../server/access";
import { requireBusiness } from "../server/business";

/** The signed copy kept with an agreement accepted on paper. */
export const Route = createFileRoute("/acceptance-files/$acceptanceId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        await requireArea("customers");
        const id = v.safeParse(
          v.pipe(v.string(), v.uuid()),
          params.acceptanceId,
        );
        const file = id.success
          ? await acceptanceAttachment(requireBusiness(), id.output)
          : null;
        if (!file) return new Response(null, { status: 404 });
        return new Response(Buffer.from(file.bytes), {
          headers: {
            "content-type": file.type,
            "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
