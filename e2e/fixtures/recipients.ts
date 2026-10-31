import { createDatabase, schema } from "@faridalms/database";
import { createControlDatabase } from "@faridalms/database/control";
import { schools } from "@faridalms/database/control-schema";
import { eq } from "drizzle-orm";

const controlUrl = process.env.CONTROL_DATABASE_URL;
if (
  !controlUrl ||
  !/^\/farida_test_control_[a-z0-9]+$/.test(new URL(controlUrl).pathname)
) {
  throw new Error("Recipient fixtures require an isolated test database");
}
const control = createControlDatabase(controlUrl);
try {
  const [school] = await control
    .select()
    .from(schools)
    .where(eq(schools.slug, "northwind"));
  if (
    !school ||
    !/^\/farida_test_northwind_[a-z0-9]+$/.test(
      new URL(school.databaseUrl).pathname,
    )
  ) {
    throw new Error("Recipient fixtures require an isolated school");
  }
  const db = createDatabase(school.databaseUrl);
  try {
    const teacher = await db.query.users.findFirst({
      where: { email: "teacher@example.com" },
    });
    if (!teacher) throw new Error("Missing teacher fixture");
    const name = `ZZ Salama ${crypto.randomUUID().slice(0, 8)}`;
    const rows = await db
      .insert(schema.users)
      .values(
        Array.from({ length: 55 }, (_, index) => ({
          name,
          email: `${crypto.randomUUID()}@example.com`,
          passwordHash: teacher.passwordHash,
          role: "teacher" as const,
          title: `Salama ${index + 1}`,
        })),
      )
      .returning({ id: schema.users.id });
    console.log(JSON.stringify({ name, ids: rows.map((row) => row.id) }));
  } finally {
    await db.$client.close();
  }
} finally {
  await control.$client.close();
}
