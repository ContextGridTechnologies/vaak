import { spawn } from "node:child_process";
import net from "node:net";
import process from "node:process";

const port = 1420;
const host = "127.0.0.1";
const checkUrl = "http://localhost:1420";

function canConnect(targetHost, targetPort) {
  return new Promise((resolve) => {
    const socket = net.createConnection(targetPort, targetHost);

    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });

    socket.once("error", () => {
      resolve(false);
    });

    socket.setTimeout(1500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function checkExistingServer() {
  if (!(await canConnect(host, port)) && !(await canConnect("::1", port))) {
    return false;
  }

  try {
    const response = await fetch(checkUrl);
    return response.ok;
  } catch {
    return false;
  }
}

if (await checkExistingServer()) {
  console.log(`Dev server already available on ${checkUrl}. Reusing it.`);
  process.exit(0);
}

const child = spawn("npm run dev", {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
  shell: true,
});

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
