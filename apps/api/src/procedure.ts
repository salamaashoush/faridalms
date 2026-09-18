import { os } from "@orpc/server";

import type { ApiContext } from "./context";

import { authenticate } from "./session";

export { hashToken } from "./session";

export const publicProcedure = os.$context<ApiContext>();

export const protectedProcedure = publicProcedure.use(
  async ({ context, next }) => {
    const session = await authenticate(context);
    try {
      return await next({
        context: {
          db: session.db,
          school: session.school,
          user: session.user,
          sessionHash: session.sessionHash,
          today: session.today,
        },
      });
    } finally {
      session.release();
    }
  },
);
