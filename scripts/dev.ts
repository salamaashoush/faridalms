import process from "node:process";

const commands = [
  ["bun", "--watch", "apps/api/src/index.ts"],
  ["bun", "run", "--cwd", "apps/web", "dev"],
  // Live editing needs its own login; without it every editor works alone.
  ...(process.env.CELL_COLLAB_URL
    ? [["bun", "--watch", "apps/collab/src/index.ts"]]
    : []),
];
const children = commands.map((cmd) =>
  Bun.spawn(cmd, { stdout: "inherit", stderr: "inherit" }),
);
function stop() {
  for (const child of children) child.kill("SIGTERM");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
const exitCode = await Promise.race(children.map((child) => child.exited));
stop();
await Promise.all(children.map((child) => child.exited));
process.exit(exitCode);
