#!/usr/bin/env node
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const originalCwd = process.cwd();
const args = process.argv.slice(2);

let projectDir = __dirname;
if (!fs.existsSync(path.join(projectDir, "package.json"))) {
  projectDir = path.join(__dirname, "..");
}

const cmd = `cd "${projectDir}" && npx ts-node src/index.ts ${args.join(" ")}`;
const child = spawn(cmd, {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, SF_VIEWER_ORIGINAL_CWD: originalCwd },
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});