import { NextRequest, NextResponse } from "next/server";
import {
  runCaseworker,
  ACCEPTED_FILE_TYPES,
  NoModelForFileError,
  type FileInput,
} from "@/lib/caseworker";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

// Cap the base64 payload so the JSON body stays under the platform's request
// limit (~4.5MB on Vercel). ~4.2M base64 chars ≈ 3.1MB decoded.
const MAX_BASE64_LEN = 4_200_000;
// Generous ceiling on pasted text — the model only reads the first 12K, so
// anything past this is abuse, not a real document.
const MAX_TEXT_LEN = 60_000;

export async function POST(req: NextRequest) {
  // Protect the paid model calls from a single client hammering the endpoint.
  const rl = rateLimit(`analyze:${clientIp(req.headers)}`, 12, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "You're going a little fast — please wait a moment and try again." },
      { status: 429, headers: { "retry-after": String(rl.retryAfter) } }
    );
  }

  try {
    const { documentText, domain, file } = await req.json();

    if (file != null) {
      if (
        typeof file !== "object" ||
        typeof file.data !== "string" ||
        typeof file.mediaType !== "string"
      ) {
        return NextResponse.json({ error: "Invalid file payload" }, { status: 400 });
      }
      if (!ACCEPTED_FILE_TYPES.includes(file.mediaType)) {
        return NextResponse.json(
          { error: "Unsupported file type. Upload a PNG, JPG, WebP, GIF, or PDF." },
          { status: 415 }
        );
      }
      if (file.data.length > MAX_BASE64_LEN) {
        return NextResponse.json(
          { error: "That file is too large (over ~3MB). Try a clearer photo, or paste the text." },
          { status: 413 }
        );
      }
    } else if (!documentText || typeof documentText !== "string") {
      return NextResponse.json(
        { error: "Provide documentText or a file" },
        { status: 400 }
      );
    }

    if (typeof documentText === "string" && documentText.length > MAX_TEXT_LEN) {
      return NextResponse.json(
        { error: "That document is very long — please trim it, or upload the PDF instead." },
        { status: 413 }
      );
    }

    const fileInput: FileInput | undefined = file
      ? { mediaType: file.mediaType, data: file.data, name: file.name }
      : undefined;

    const analysis = await runCaseworker(
      fileInput
        ? { documentText: typeof documentText === "string" ? documentText : "", file: fileInput }
        : (documentText as string),
      domain ?? "benefits"
    );
    return NextResponse.json(analysis);
  } catch (err) {
    // A file was uploaded but no model is configured to read it — tell the user
    // exactly what to do (the live deployment has a model, so this is local-only).
    if (err instanceof NoModelForFileError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("[/api/analyze]", err);
    return NextResponse.json(
      { error: "Failed to analyze document" },
      { status: 500 }
    );
  }
}
