import { json } from "./_lib.js";

// Receives raw audio bytes from the app and forwards them to Deepgram Nova.
export async function onRequestPost({ request, env }) {
  if (!env.DEEPGRAM_API_KEY)
    return json({ error: "Transcription not configured. Add DEEPGRAM_API_KEY in Cloudflare." }, 501);

  const contentType = request.headers.get("content-type") || "audio/mp4";
  const audio = await request.arrayBuffer();
  if (!audio || audio.byteLength === 0) return json({ error: "No audio received." }, 400);

  const params = new URLSearchParams({
    model: "nova-3",
    smart_format: "true",
    punctuate: "true",
    paragraphs: "true",
  });

  const r = await fetch("https://api.deepgram.com/v1/listen?" + params, {
    method: "POST",
    headers: { authorization: "Token " + env.DEEPGRAM_API_KEY, "content-type": contentType },
    body: audio,
  });
  if (!r.ok) return json({ error: "Deepgram error: " + (await r.text()) }, 502);

  const data = await r.json();
  const alt = data?.results?.channels?.[0]?.alternatives?.[0];
  return json({ transcript: alt?.transcript || "" });
}
