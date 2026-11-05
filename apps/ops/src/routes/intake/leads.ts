import { intakeLead } from "@faridalms/database/business/leads";
import {
  INTAKE_SIGNATURE_HEADER,
  INTAKE_TIMESTAMP_HEADER,
  verifyIntake,
} from "@faridalms/domain/intake";
import { leadIntakeSchema } from "@faridalms/domain/leads";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { businessDb } from "../../server/business";
import { opsEnv } from "../../server/env";

const answer = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * Where the cells send leads: a body signed with the shared secret, within
 * minutes of being sent, once per intake id. Nothing answers here without
 * the secret and the business database.
 */
export const Route = createFileRoute("/intake/leads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = opsEnv().INTAKE_SECRET;
        const db = businessDb();
        if (!secret || !db) return answer({ code: "NOT_FOUND" }, 404);
        const body = await request.text();
        if (
          !verifyIntake({
            secret,
            timestamp: request.headers.get(INTAKE_TIMESTAMP_HEADER),
            signature: request.headers.get(INTAKE_SIGNATURE_HEADER),
            body,
            now: new Date(),
          })
        )
          return answer({ code: "UNAUTHORIZED" }, 401);
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          return answer({ code: "BAD_REQUEST" }, 400);
        }
        const lead = v.safeParse(leadIntakeSchema, parsed);
        if (!lead.success) return answer({ code: "BAD_REQUEST" }, 400);
        return answer(await intakeLead(db, lead.output), 200);
      },
    },
  },
});
