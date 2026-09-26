import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Bootstraps a local .env for a developer. In CI and in a container build the
// configuration comes from the environment, so writing a file there would at
// best be pointless and at worst bake a generated secret into an image layer.
if (process.env.CI === "true" || process.env.NODE_ENV === "production") {
  process.exit(0);
}

const ENV_FILE = join(process.cwd(), ".env");
const ENV_EXAMPLE_FILE = join(process.cwd(), ".env.example");

/** Values generated per developer when the key is missing or empty. */
const GENERATED: Record<string, () => string> = {
  SESSION_SECRET: () => randomBytes(32).toString("base64"),
  CELL_ROLE_PASSWORD: () => randomBytes(24).toString("hex"),
  CELL_KEK: () => randomBytes(32).toString("base64"),
  CELL_SECRET: () => randomBytes(32).toString("base64"),
};

const keyOf = (line: string) => /^([A-Z0-9_]+)\s*=/.exec(line)?.[1];
const valueOf = (line: string) =>
  line
    .slice(line.indexOf("=") + 1)
    .trim()
    .replaceAll(/^['"]|['"]$/g, "");

async function main() {
  if (!existsSync(ENV_FILE)) {
    await cp(ENV_EXAMPLE_FILE, ENV_FILE);
    console.log("Copied .env.example to .env");
  }
  const lines = (await readFile(ENV_FILE, "utf8")).split("\n");
  const example = (await readFile(ENV_EXAMPLE_FILE, "utf8")).split("\n");
  const present = new Set(lines.map(keyOf).filter(Boolean));
  const added: string[] = [];
  for (const line of example) {
    const key = keyOf(line);
    if (key && !present.has(key)) {
      lines.push(line);
      present.add(key);
      added.push(key);
    }
  }
  for (const [key, generate] of Object.entries(GENERATED)) {
    const index = lines.findIndex((line) => keyOf(line) === key);
    if (index === -1) {
      lines.push(`${key}='${generate()}'`);
      added.push(key);
    } else if (!valueOf(lines[index] ?? "")) {
      lines[index] = `${key}='${generate()}'`;
      added.push(key);
    }
  }
  if (added.length > 0) {
    await writeFile(ENV_FILE, lines.join("\n"), "utf8");
    console.log(`Added to .env: ${[...new Set(added)].join(", ")}`);
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
