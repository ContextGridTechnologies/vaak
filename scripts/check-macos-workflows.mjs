import { readFile } from "node:fs/promises";

const workflows = [
  ".github/workflows/desktop-ci.yml",
  ".github/workflows/macos-preview-build.yml",
  ".github/workflows/desktop-release.yml",
];

const requiredSnippets = [
  "arch: AppleSilicon",
  "runner: macos-15",
  "uname: arm64",
  "arch: Intel",
  "runner: macos-15-intel",
  "uname: x86_64",
  "Verify runner architecture",
  'actual="$(uname -m)"',
  'if [ "$actual" != "${{ matrix.uname }}" ]; then',
];

const forbiddenSnippets = [
  "Vaak-macOS-Preview",
  "Vaak-macOS-app",
  "Vaak-macOS-dmg",
];

let failed = false;

for (const workflow of workflows) {
  const text = await readFile(workflow, "utf8");

  for (const snippet of requiredSnippets) {
    if (!text.includes(snippet)) {
      console.error(`${workflow}: missing required macOS workflow snippet: ${snippet}`);
      failed = true;
    }
  }

  for (const snippet of forbiddenSnippets) {
    if (text.includes(snippet)) {
      console.error(`${workflow}: found generic macOS artifact snippet: ${snippet}`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log("macOS workflow invariants ok");
