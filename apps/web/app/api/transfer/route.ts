import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

type TransferMode = "enforced" | "bypass";

type TransferRequestBody = {
  from: string;
  to: string;
  amount: number;
  mode: TransferMode;
};

function isTransferMode(value: unknown): value is TransferMode {
  return value === "enforced" || value === "bypass";
}

function isTransferRequestBody(value: unknown): value is TransferRequestBody {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.from === "string" &&
    typeof candidate.to === "string" &&
    typeof candidate.amount === "number" &&
    isTransferMode(candidate.mode)
  );
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!isTransferRequestBody(body)) {
    return NextResponse.json(
      { ok: false, error: "Body must include from, to, amount, and mode" },
      { status: 400 },
    );
  }

  if (!Number.isFinite(body.amount) || body.amount <= 0) {
    return NextResponse.json(
      { ok: false, error: "Amount must be a positive number" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    txId: `demo_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
    from: body.from,
    to: body.to,
    amount: body.amount,
    mode: body.mode,
    timestamp: new Date().toISOString(),
  });
}
