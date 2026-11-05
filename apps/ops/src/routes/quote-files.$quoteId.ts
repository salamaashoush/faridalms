import { quoteAttachment } from "@faridalms/database/business/quotes";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { requireArea } from "../server/access";
import { requireBusiness } from "../server/business";

/** The signed copy or purchase order kept with an accepted quote. */
export const Route = createFileRoute("/quote-files/$quoteId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        await requireArea("leads");
        const id = v.safeParse(v.pipe(v.string(), v.uuid()), params.quoteId);
        const file = id.success
          ? await quoteAttachment(requireBusiness(), id.output)
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
