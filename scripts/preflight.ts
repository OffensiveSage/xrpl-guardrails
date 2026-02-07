const { createHash } = require("node:crypto");
const { spawn } = require("node:child_process");
const fs = require("node:fs").promises;
const path = require("node:path");

const CHECK_STATUS = {
  PASS: "pass",
  WARN: "warn",
  FAIL: "fail",
};

const SEVERITIES = ["critical", "high", "moderate", "low"];

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

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isExactVersionString(version) {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version);
}

function findXrplLockfileEntry(lockfileJson) {
  if (!isRecord(lockfileJson)) {
    return null;
  }

  const packages = lockfileJson.packages;
  if (isRecord(packages)) {
    for (const [entryPath, entryValue] of Object.entries(packages)) {
      const isXrplPath =
        entryPath === "node_modules/xrpl" ||
        entryPath.endsWith("/node_modules/xrpl");

      if (
        isXrplPath &&
        isRecord(entryValue) &&
        typeof entryValue.version === "string"
      ) {
        return {
          location: `packages["${entryPath}"]`,
          version: entryValue.version,
        };
      }
    }
  }

  const dependencies = lockfileJson.dependencies;
  if (
    isRecord(dependencies) &&
    isRecord(dependencies.xrpl) &&
    typeof dependencies.xrpl.version === "string"
  ) {
    return {
      location: "dependencies.xrpl",
      version: dependencies.xrpl.version,
    };
  }

  return null;
}

function createSeverityCounts() {
  return {
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0,
  };
}

function asCheck(name, ok, details) {
  return {
    name,
    status: ok ? CHECK_STATUS.PASS : CHECK_STATUS.FAIL,
    ...(details ? { details } : {}),
  };
}

function normalizeSeverity(severity) {
  return typeof severity === "string" ? severity.toLowerCase() : "";
}

function nonEmptyString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function addSeverityCount(counts, severity, amount = 1) {
  const normalized = normalizeSeverity(severity);
  if (SEVERITIES.includes(normalized)) {
    counts[normalized] += amount;
  }
}

function parseJsonCandidate(text) {
  if (typeof text !== "string") {
    return { parsed: null, parseError: "No JSON text available" };
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return { parsed: null, parseError: "No JSON output from npm audit" };
  }

  try {
    return { parsed: JSON.parse(trimmed), parseError: null };
  } catch (error) {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");

    if (start >= 0 && end > start) {
      try {
        return { parsed: JSON.parse(trimmed.slice(start, end + 1)), parseError: null };
      } catch {
        // Fall through to report the original parse failure.
      }
    }

    return {
      parsed: null,
      parseError: error instanceof Error ? error.message : "Unknown JSON parse error",
    };
  }
}

function extractAuditSummary(parsedAuditJson) {
  const counts = createSeverityCounts();
  const vulnerablePackages = new Set();
  let countsFromMetadata = false;

  if (
    isRecord(parsedAuditJson) &&
    isRecord(parsedAuditJson.metadata) &&
    isRecord(parsedAuditJson.metadata.vulnerabilities)
  ) {
    let foundAnyNumericCount = false;

    for (const severity of SEVERITIES) {
      const count = parsedAuditJson.metadata.vulnerabilities[severity];
      if (typeof count === "number" && Number.isFinite(count)) {
        counts[severity] = count;
        foundAnyNumericCount = true;
      }
    }

    countsFromMetadata = foundAnyNumericCount;
  }

  if (isRecord(parsedAuditJson) && isRecord(parsedAuditJson.vulnerabilities)) {
    for (const [packageName, vulnerability] of Object.entries(parsedAuditJson.vulnerabilities)) {
      if (packageName) {
        vulnerablePackages.add(packageName);
      }

      if (!countsFromMetadata && isRecord(vulnerability)) {
        addSeverityCount(counts, vulnerability.severity);
      }
    }
  }

  if (isRecord(parsedAuditJson) && isRecord(parsedAuditJson.advisories)) {
    for (const advisory of Object.values(parsedAuditJson.advisories)) {
      if (!isRecord(advisory)) {
        continue;
      }

      if (typeof advisory.module_name === "string" && advisory.module_name) {
        vulnerablePackages.add(advisory.module_name);
      }

      if (!countsFromMetadata) {
        addSeverityCount(counts, advisory.severity);
      }
    }
  }

  return {
    counts,
    vulnerablePackageNames: [...vulnerablePackages].sort().slice(0, 5),
  };
}

function extractAuditErrorMessage(parsedAuditJson) {
  if (!isRecord(parsedAuditJson)) {
    return null;
  }

  const rootMessage = nonEmptyString(parsedAuditJson.message);
  const stringError = nonEmptyString(parsedAuditJson.error);
  if (stringError) {
    return stringError;
  }

  if (!isRecord(parsedAuditJson.error)) {
    return rootMessage;
  }

  const summary = nonEmptyString(parsedAuditJson.error.summary);
  if (summary) {
    return summary;
  }

  const message = nonEmptyString(parsedAuditJson.error.message);
  if (message) {
    return message;
  }

  const detail = nonEmptyString(parsedAuditJson.error.detail);
  if (detail) {
    return detail;
  }

  if (rootMessage) {
    return rootMessage;
  }

  const errorCode = nonEmptyString(parsedAuditJson.error.code);
  if (errorCode) {
    return `npm audit error code: ${errorCode}`;
  }

  return null;
}

function formatAuditDetails(counts, vulnerablePackageNames, note) {
  const packagesText =
    vulnerablePackageNames.length > 0 ? vulnerablePackageNames.join(", ") : "none";
  const details =
    `critical=${counts.critical}, high=${counts.high}, ` +
    `moderate=${counts.moderate}, low=${counts.low}; ` +
    `packages=${packagesText}`;

  return note ? `${details}; note=${note}` : details;
}

async function runCommand(command, args, cwd) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let spawnError = null;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      spawnError = error instanceof Error ? error.message : "Unknown process spawn error";
      finish({
        exitCode: null,
        stdout,
        stderr,
        spawnError,
      });
    });

    child.on("close", (exitCode) => {
      finish({
        exitCode: typeof exitCode === "number" ? exitCode : null,
        stdout,
        stderr,
        spawnError,
      });
    });
  });
}

async function runNpmAuditPolicyCheck(repoRoot) {
  const counts = createSeverityCounts();
  const emptyPackageList = [];
  const auditOutput = await runCommand("npm", ["audit", "--json"], repoRoot);

  if (auditOutput.spawnError) {
    return {
      name: "npm audit policy",
      status: CHECK_STATUS.FAIL,
      details: formatAuditDetails(counts, emptyPackageList, auditOutput.spawnError),
    };
  }

  const stdoutResult = parseJsonCandidate(auditOutput.stdout);
  const stderrResult =
    stdoutResult.parsed === null ? parseJsonCandidate(auditOutput.stderr) : { parsed: null, parseError: null };
  const parsedAuditJson = stdoutResult.parsed ?? stderrResult.parsed;
  const parseError = stdoutResult.parseError ?? stderrResult.parseError;

  if (parsedAuditJson === null) {
    const noteParts = [];
    if (parseError) {
      noteParts.push(`could not parse npm audit JSON (${parseError})`);
    }
    if (auditOutput.exitCode !== null) {
      noteParts.push(
        auditOutput.exitCode === 1
          ? "npm audit returned non-zero because vulnerabilities were found (expected)"
          : `npm audit exited with code ${auditOutput.exitCode}`,
      );
    }

    return {
      name: "npm audit policy",
      status: CHECK_STATUS.FAIL,
      details: formatAuditDetails(counts, emptyPackageList, noteParts.join("; ")),
    };
  }

  const summary = extractAuditSummary(parsedAuditJson);
  const auditErrorMessage = extractAuditErrorMessage(parsedAuditJson);
  let status = CHECK_STATUS.PASS;

  if (auditErrorMessage) {
    status = CHECK_STATUS.FAIL;
  } else if (summary.counts.critical > 0 || summary.counts.high > 0) {
    status = CHECK_STATUS.FAIL;
  } else if (summary.counts.moderate > 0 || summary.counts.low > 0) {
    status = CHECK_STATUS.WARN;
  }

  if (
    status === CHECK_STATUS.PASS &&
    auditOutput.exitCode !== null &&
    auditOutput.exitCode !== 0
  ) {
    status = CHECK_STATUS.FAIL;
  }

  const noteParts = [];
  if (auditErrorMessage) {
    noteParts.push(auditErrorMessage);
  }
  if (auditOutput.exitCode !== null && auditOutput.exitCode !== 0) {
    noteParts.push(
      auditOutput.exitCode === 1
        ? "npm audit returned non-zero because vulnerabilities were found (expected)"
        : `npm audit exited with code ${auditOutput.exitCode}`,
    );
  }

  return {
    name: "npm audit policy",
    status,
    details: formatAuditDetails(
      summary.counts,
      summary.vulnerablePackageNames,
      noteParts.length > 0 ? noteParts.join("; ") : null,
    ),
  };
}

async function run() {
  const repoRoot = path.resolve(__dirname, "..");
  const rootLockfilePath = path.join(repoRoot, "package-lock.json");
  const webDirPath = path.join(repoRoot, "apps", "web");
  const webPackageJsonPath = path.join(webDirPath, "package.json");
  const webLockfilePath = path.join(webDirPath, "package-lock.json");
  const statusPath = path.join(webDirPath, "public", "status.json");

  const checks = [];
  let lockfileSha256 = null;
  let rootLockfileJson = null;
  let rootLockfileParseError = null;
  let xrplVersion = null;

  const hasRootLockfile = await pathExists(rootLockfilePath);
  checks.push(asCheck("root package-lock.json exists", hasRootLockfile));

  const hasWebDir = await isDirectory(webDirPath);
  checks.push(asCheck("apps/web exists", hasWebDir));

  const hasWebLockfile = await pathExists(webLockfilePath);
  checks.push(asCheck("apps/web/package-lock.json does not exist", !hasWebLockfile));

  if (hasRootLockfile) {
    try {
      const lockfileText = await fs.readFile(rootLockfilePath, "utf8");
      lockfileSha256 = createHash("sha256").update(lockfileText).digest("hex");

      try {
        rootLockfileJson = JSON.parse(lockfileText);
      } catch (error) {
        rootLockfileParseError =
          error instanceof Error ? error.message : "Unknown parse error";
      }

      checks.push(asCheck("sha256 of root package-lock.json computed", true));
    } catch (error) {
      const details = error instanceof Error ? error.message : "Unknown read error";
      rootLockfileParseError = details;
      checks.push(asCheck("sha256 of root package-lock.json computed", false, details));
    }
  } else {
    checks.push(
      asCheck("sha256 of root package-lock.json computed", false, "root package-lock.json is missing"),
    );
  }

  const hasWebPackageJson = await pathExists(webPackageJsonPath);
  let xrplDependencyCheckDetails = null;

  if (!hasWebPackageJson) {
    xrplDependencyCheckDetails = "apps/web/package.json is missing";
  } else {
    try {
      const webPackageJsonText = await fs.readFile(webPackageJsonPath, "utf8");
      const webPackageJson = JSON.parse(webPackageJsonText);

      if (!isRecord(webPackageJson)) {
        xrplDependencyCheckDetails = "apps/web/package.json must contain a JSON object";
      } else if (!isRecord(webPackageJson.dependencies)) {
        xrplDependencyCheckDetails = "apps/web/package.json dependencies is missing";
      } else if (typeof webPackageJson.dependencies.xrpl !== "string") {
        xrplDependencyCheckDetails = "dependencies.xrpl is missing";
      } else if (!isExactVersionString(webPackageJson.dependencies.xrpl)) {
        xrplDependencyCheckDetails =
          `dependencies.xrpl must be an exact version (no ^ or ~); found "${webPackageJson.dependencies.xrpl}"`;
      } else {
        xrplVersion = webPackageJson.dependencies.xrpl;
      }
    } catch (error) {
      xrplDependencyCheckDetails =
        error instanceof Error ? error.message : "Unknown apps/web/package.json parse error";
    }
  }

  checks.push(
    asCheck(
      "apps/web/package.json pins xrpl to an exact version",
      xrplVersion !== null,
      xrplDependencyCheckDetails,
    ),
  );

  let xrplLockfileCheckDetails = null;
  let xrplLockfileMatches = false;

  if (xrplVersion === null) {
    xrplLockfileCheckDetails =
      "apps/web/package.json xrpl version check failed, cannot compare lockfile";
  } else if (!hasRootLockfile) {
    xrplLockfileCheckDetails = "root package-lock.json is missing";
  } else if (rootLockfileParseError !== null) {
    xrplLockfileCheckDetails = `could not parse root package-lock.json (${rootLockfileParseError})`;
  } else {
    const xrplLockfileEntry = findXrplLockfileEntry(rootLockfileJson);

    if (xrplLockfileEntry === null) {
      xrplLockfileCheckDetails =
        `root package-lock.json does not contain an xrpl entry at version "${xrplVersion}"`;
    } else if (xrplLockfileEntry.version !== xrplVersion) {
      xrplLockfileCheckDetails =
        `${xrplLockfileEntry.location} is "${xrplLockfileEntry.version}", expected "${xrplVersion}"`;
    } else {
      xrplLockfileMatches = true;
    }
  }

  checks.push(
    asCheck(
      "root package-lock.json contains xrpl at the same version",
      xrplLockfileMatches,
      xrplLockfileCheckDetails,
    ),
  );

  checks.push(await runNpmAuditPolicyCheck(repoRoot));

  const hasFail = checks.some((check) => check.status === CHECK_STATUS.FAIL);
  const hasWarn = checks.some((check) => check.status === CHECK_STATUS.WARN);
  const overall = hasFail ? "red" : hasWarn ? "yellow" : "green";

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
