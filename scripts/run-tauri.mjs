import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";

const repoRoot = process.cwd();
const cargoBin = path.join(os.homedir(), ".cargo", "bin");
const extraArgs = process.argv.slice(2);
const pathKey = Object.keys(process.env).find(
  (key) => key.toLowerCase() === "path",
) ?? "PATH";

const env = {
  ...process.env,
  [pathKey]: [cargoBin, process.env[pathKey]]
    .filter(Boolean)
    .join(path.delimiter),
};

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const child = spawn(
  npmCommand,
  ["--prefix", "apps/desktop", "run", "tauri", "--", ...extraArgs],
  {
    cwd: repoRoot,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
