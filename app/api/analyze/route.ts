import { NextRequest, NextResponse } from "next/server";
import { runCaseworker } from "@/lib/caseworker";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { documentText, domain } = await req.json();

    if (!documentText || typeof documentText !== "string") {
      return NextResponse.json(
        { error: "documentText is required" },
        { status: 400 }
      );
    }

    const analysis = await runCaseworker(documentText, domain ?? "benefits");
    return NextResponse.json(analysis);
  } catch (err) {
    console.error("[/api/analyze]", err);
    return NextResponse.json(
      { error: "Failed to analyze document" },
      { status: 500 }
    );
  }
}
