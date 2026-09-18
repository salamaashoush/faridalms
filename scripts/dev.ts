import process from "node:process";

const commands = [
  ["bun", "--watch", "apps/api/src/index.ts"],
  ["bun", "run", "--cwd", "apps/web", "dev"],
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
