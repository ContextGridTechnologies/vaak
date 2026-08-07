import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const VERSION = "0.2.0";
const ASSETS = {
  x64: {
    name: `FlaUI-MCP-win-x64-${VERSION}-self-contained.zip`,
    sha256: "6428bb38aef433d8754b48cbaaff4f1eca5e98c107e89b0ad90399a9fcb1a106",
  },
  arm64: {
    name: `FlaUI-MCP-win-arm64-${VERSION}-self-contained.zip`,
    sha256: "1a00162fc1a7c3fac924dfc5702cd66deb51d3a9f6a870c1e339a3defb6e20a4",
  },
};

if (process.platform !== "win32") {
  console.log("FlaUI MCP runtime is Windows-only; skipping runtime preparation.");
  process.exit(0);
}

const asset = ASSETS[process.arch];
if (!asset) throw new Error(`FlaUI MCP does not support Windows ${process.arch}`);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const destination = join(scriptDir, "..", "src-tauri", "resources", "mcp", asset.name);
await mkdir(dirname(destination), { recursive: true });

if (await hasExpectedDigest(destination, asset.sha256)) {
  console.log(`Using verified FlaUI MCP ${VERSION} runtime.`);
  process.exit(0);
}

const partial = `${destination}.${process.pid}.partial`;
await rm(partial, { force: true });
const url = `https://github.com/shanselman/FlaUI-MCP/releases/download/v${VERSION}/${asset.name}`;
console.log(`Downloading pinned FlaUI MCP ${VERSION} runtime...`);
const response = await fetch(url, { redirect: "follow" });
if (!response.ok || !response.body) {
  throw new Error(`FlaUI MCP download failed: HTTP ${response.status}`);
}
await pipeline(response.body, createWriteStream(partial, { flags: "wx" }));

if (!(await hasExpectedDigest(partial, asset.sha256))) {
  await rm(partial, { force: true });
  throw new Error("FlaUI MCP download failed SHA-256 verification");
}
await rm(destination, { force: true });
await rename(partial, destination);
console.log(`Verified FlaUI MCP ${VERSION}: ${asset.name}`);

async function hasExpectedDigest(path, expected) {
  try {
    if (!(await stat(path)).isFile()) return false;
  } catch {
    return false;
  }
  const digest = createHash("sha256");
  await pipeline(createReadStream(path), digest);
  return digest.digest("hex") === expected;
}
