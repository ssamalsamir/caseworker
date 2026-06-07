import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// ElevenLabs text-to-speech. Returns audio/mpeg bytes the browser can play.
// If no key is configured we return 204 so the UI quietly hides the button.
export async function POST(req: NextRequest) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return new NextResponse(null, { status: 204 });

  const { text } = await req.json();
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": key,
          "content-type": "application/json",
          accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );

    if (!res.ok) {
      console.error("[/api/speak] ElevenLabs", res.status, await res.text());
      return NextResponse.json({ error: "TTS failed" }, { status: 502 });
    }

    const audio = await res.arrayBuffer();
    return new NextResponse(audio, {
      headers: { "content-type": "audio/mpeg" },
    });
  } catch (err) {
    console.error("[/api/speak]", err);
    return NextResponse.json({ error: "TTS error" }, { status: 500 });
  }
}
