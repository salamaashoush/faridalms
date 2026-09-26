import { CATALOGUE_CHECK } from "@faridalms/database/gates";
import { SQL } from "bun";

const url = process.argv[2] ?? process.env.CELL_CHECK_URL;
if (!url) {
  console.error("Usage: bun scripts/check-rls.ts <cell database url>");
  process.exit(2);
}
const client = new SQL(url);
try {
  const problems: { name: string; problem: string }[] =
    await client.unsafe(CATALOGUE_CHECK);
  if (problems.length > 0) {
    for (const row of problems) console.error(`${row.name}: ${row.problem}`);
    console.error(`Catalogue check: ${problems.length} problems.`);
    process.exitCode = 1;
  } else console.info("Catalogue check: no problems.");
} finally {
  await client.close();
}
