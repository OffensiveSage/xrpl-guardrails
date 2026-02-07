import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

type StatusPayload = {
  overall: "green" | "red";
  timestamp: string;
  lockfileSha256: string | null;
  checks: Array<{
    name: string;
    ok: boolean;
    details?: string;
  }>;
};

async function readStatus(statusPath: string): Promise<StatusPayload> {
  const raw = await fs.readFile(statusPath, "utf8");
  return JSON.parse(raw) as StatusPayload;
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

export async function POST() {
  const repoRoot = await resolveRepoRoot();
  const scriptPath = path.join(repoRoot, "scripts", "preflight.ts");
  const statusPath = path.join(repoRoot, "apps", "web", "public", "status.json");

  try {
    await execFileAsync("node", [scriptPath], { cwd: repoRoot });
  } catch {
    // A non-zero exit means the status is red. We still return the status file.
  }

  try {
    const status = await readStatus(statusPath);
    const responseCode = status.overall === "green" ? 200 : 500;
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
