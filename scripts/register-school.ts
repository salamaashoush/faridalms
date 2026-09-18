import { createControlDatabase } from "@faridalms/database/control";
import { schools } from "@faridalms/database/control-schema";
import * as v from "valibot";

const input = v.parse(
  v.object({
    CONTROL_DATABASE_URL: v.pipe(v.string(), v.url()),
    DATABASE_URL: v.pipe(v.string(), v.url()),
    SCHOOL_SLUG: v.pipe(v.string(), v.regex(/^[a-z0-9][a-z0-9-]{0,63}$/)),
    SCHOOL_NAME: v.pipe(v.string(), v.minLength(1), v.maxLength(160)),
    SCHOOL_TIMEZONE: v.optional(v.string(), "Africa/Cairo"),
  }),
  process.env,
);
new Intl.DateTimeFormat("en", { timeZone: input.SCHOOL_TIMEZONE }).format(
  new Date(),
);
const control = createControlDatabase(input.CONTROL_DATABASE_URL);
try {
  await control.insert(schools).values({
    slug: input.SCHOOL_SLUG,
    name: input.SCHOOL_NAME,
    databaseUrl: input.DATABASE_URL,
    timeZone: input.SCHOOL_TIMEZONE,
  });
  console.info(`Registered school ${input.SCHOOL_SLUG}`);
} finally {
  await control.$client.close();
}
