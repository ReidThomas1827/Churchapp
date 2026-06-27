import { json, gemini } from "./_lib.js";

export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY)
    return json({ error: "Notes not configured. Add GEMINI_API_KEY in Cloudflare." }, 501);

  const { transcript } = await request.json().catch(() => ({}));
  if (!transcript) return json({ error: "No transcript provided." }, 400);

  const prompt = `You are a careful sermon note-taker. Convert the transcript below into structured study notes.
Return ONLY JSON matching this shape:
{"summary": string, "scriptures": string[], "sections": [{"heading": string, "points": string[]}], "takeaways": string[]}
Keep points concise and faithful to what was said. Follow the preacher's structure where it's clear.

Transcript:
"""${String(transcript).slice(0, 30000)}"""`;

  try {
    return json({ notes: await gemini(env, prompt, { wantJSON: true }) });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}
