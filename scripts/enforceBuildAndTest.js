const { spawnSync } = require("child_process");

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: "inherit", env: process.env });
  return typeof res.status === "number" ? res.status : 1;
}

function npmCmd() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

const npm = npmCmd();

let code = 0;
code ||= run(npm, ["run", "build"]);
code ||= run(npm, ["test", "--", "--watchAll=false"]);

process.exit(code ? 1 : 0);

