const { createHash } = require("node:crypto");
const fs = require("node:fs").promises;
const path = require("node:path");

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(targetPath) {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function run() {
  const repoRoot = path.resolve(__dirname, "..");
  const rootLockfilePath = path.join(repoRoot, "package-lock.json");
  const webDirPath = path.join(repoRoot, "apps", "web");
  const webLockfilePath = path.join(webDirPath, "package-lock.json");
  const statusPath = path.join(webDirPath, "public", "status.json");

  const checks = [];
  let lockfileSha256 = null;

  const hasRootLockfile = await pathExists(rootLockfilePath);
  checks.push({
    name: "root package-lock.json exists",
    ok: hasRootLockfile,
  });

  const hasWebDir = await isDirectory(webDirPath);
  checks.push({
    name: "apps/web exists",
    ok: hasWebDir,
  });

  const hasWebLockfile = await pathExists(webLockfilePath);
  checks.push({
    name: "apps/web/package-lock.json does not exist",
    ok: !hasWebLockfile,
  });

  if (hasRootLockfile) {
    try {
      const lockfile = await fs.readFile(rootLockfilePath);
      lockfileSha256 = createHash("sha256").update(lockfile).digest("hex");
      checks.push({
        name: "sha256 of root package-lock.json computed",
        ok: true,
      });
    } catch (error) {
      const details =
        error instanceof Error ? error.message : "Unknown hash error";
      checks.push({
        name: "sha256 of root package-lock.json computed",
        ok: false,
        details,
      });
    }
  } else {
    checks.push({
      name: "sha256 of root package-lock.json computed",
      ok: false,
      details: "root package-lock.json is missing",
    });
  }

  const overall = checks.every((check) => check.ok)
    ? "green"
    : "red";

  const status = {
    overall,
    timestamp: new Date().toISOString(),
    lockfileSha256,
    checks,
  };

  await fs.mkdir(path.dirname(statusPath), { recursive: true });
  await fs.writeFile(statusPath, `${JSON.stringify(status, null, 2)}\n`, "utf8");

  if (overall === "red") {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Preflight failed to execute: ${message}`);
  process.exitCode = 1;
});
