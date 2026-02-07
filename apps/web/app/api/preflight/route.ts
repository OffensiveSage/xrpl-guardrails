import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { type NextRequest, NextResponse } from "next/server";

const execFileAsync = promisify(execFile);
const XRPL_LOCKFILE_CHECK_NAME = "root package-lock.json contains xrpl at the same version";

type Check = {
  name: string;
  status: "pass" | "warn" | "fail";
  details?: string;
};

type StatusPayload = {
  overall: "green" | "yellow" | "red";
  timestamp: string;
  lockfileSha256: string | null;
  checks: Check[];
  bypassEnabled: boolean;
  simulatedScenario: "version_mismatch" | null;
};

async function readStatus(statusPath: string): Promise<Omit<StatusPayload, "bypassEnabled" | "simulatedScenario">> {
  const raw = await fs.readFile(statusPath, "utf8");
  return JSON.parse(raw) as Omit<StatusPayload, "bypassEnabled" | "simulatedScenario">;
}

async function writeStatus(statusPath: string, status: StatusPayload): Promise<void> {
  await fs.writeFile(statusPath, `${JSON.stringify(status, null, 2)}\n`, "utf8");
}

async function resolveRepoRoot(): Promise<string> {
  const candidates = [process.cwd(), path.resolve(process.cwd(), "..", "..")];

  for (const candidate of candidates) {
    const scriptPath = path.join(candidate, "scripts", "preflight.ts");
    try {
      await fs.access(scriptPath);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  return candidates[0];
}

function parseBypass(value: string | null): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

function parseSimulatedScenario(value: string | null): "version_mismatch" | null {
  if (!value) {
    return null;
  }
  return value.trim().toLowerCase() === "version_mismatch" ? "version_mismatch" : null;
}

function toSimulatedLockfileVersion(packageVersion: string | null): string {
  if (!packageVersion) {
    return "2.13.0";
  }

  const semverMatch = packageVersion.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!semverMatch) {
    return "2.13.0";
  }

  const major = Number.parseInt(semverMatch[1], 10);
  const minor = Number.parseInt(semverMatch[2], 10);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) {
    return "2.13.0";
  }

  if (minor > 0) {
    return `${major}.${minor - 1}.0`;
  }

  return `${major}.0.0`;
}

async function readWebPackageXrplVersion(repoRoot: string): Promise<string | null> {
  const packageJsonPath = path.join(repoRoot, "apps", "web", "package.json");
  try {
    const raw = await fs.readFile(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as { dependencies?: Record<string, unknown> };
    const version = parsed.dependencies?.xrpl;
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

function injectSimulatedVersionMismatch(
  status: StatusPayload,
  packageVersion: string | null,
): StatusPayload {
  const simulatedLockfileVersion = toSimulatedLockfileVersion(packageVersion);
  const details = `package.json xrpl=${packageVersion ?? "unknown"}, lockfile xrpl=${simulatedLockfileVersion} (simulated mismatch)`;

  let found = false;
  const checks = status.checks.map((check) => {
    if (check.name !== XRPL_LOCKFILE_CHECK_NAME) {
      return check;
    }
    found = true;
    return {
      ...check,
      status: "fail" as const,
      details,
    };
  });

  if (!found) {
    checks.push({
      name: XRPL_LOCKFILE_CHECK_NAME,
      status: "fail",
      details,
    });
  }

  return {
    ...status,
    overall: "red",
    checks,
  };
}

export async function POST(request: NextRequest) {
  const bypassEnabled = parseBypass(request.nextUrl.searchParams.get("bypass"));
  const simulatedScenario = parseSimulatedScenario(
    request.nextUrl.searchParams.get("simulate"),
  );
  const repoRoot = await resolveRepoRoot();
  const scriptPath = path.join(repoRoot, "scripts", "preflight.ts");
  const statusPath = path.join(repoRoot, "apps", "web", "public", "status.json");

  try {
    await execFileAsync("node", [scriptPath], { cwd: repoRoot });
  } catch {
    // A non-zero exit means preflight failed. Continue to read and return status.
  }

  try {
    const baseStatus = await readStatus(statusPath);

    let status: StatusPayload = {
      ...baseStatus,
      bypassEnabled,
      simulatedScenario,
    };

    if (simulatedScenario === "version_mismatch") {
      const packageVersion = await readWebPackageXrplVersion(repoRoot);
      status = injectSimulatedVersionMismatch(status, packageVersion);
    }

    await writeStatus(statusPath, status);

    const responseCode = status.overall === "red" && !bypassEnabled ? 500 : 200;
    return NextResponse.json(status, { status: responseCode });
  } catch {
    return NextResponse.json(
      {
        overall: "red",
        error: "Unable to read status.json after running preflight",
      },
      { status: 500 },
    );
  }
}
