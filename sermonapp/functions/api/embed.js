import { json, supaConfigured, supaUpsert, geminiEmbed, toVector } from "./_lib.js";

function chunkText(text, size = 1400, overlap = 200) {
  text = String(text || "");
  const chunks = [];
  for (let i = 0; i < text.length; i += size - overlap) chunks.push(text.slice(i, i + size));
  return chunks.filter((c) => c.trim());
}

// Embeds a sermon's notes + transcript into pgvector for global search.
export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY) return json({ error: "Embeddings need GEMINI_API_KEY." }, 501);
  if (!supaConfigured(env)) return json({ error: "Embeddings need SUPABASE_URL + SUPABASE_SERVICE_ROLE." }, 501);

  const { sermonId, title, transcript, notes } = await request.json().catch(() => ({}));
  if (!sermonId || !transcript) return json({ error: "sermonId and transcript are required." }, 400);

  const noteText = notes && !notes.raw
    ? [notes.summary, ...(notes.sections || []).flatMap((s) => s.points || []), ...(notes.takeaways || [])].filter(Boolean).join(". ")
    : (notes && notes.raw) || "";

  const pieces = chunkText(`${title || ""}\n${noteText}\n${transcript}`);
  const rows = [];
  for (let i = 0; i < pieces.length; i++) {
    const vec = await geminiEmbed(env, pieces[i]);
    rows.push({ id: `${sermonId}_${i}`, source_type: "sermon", source_id: sermonId, chunk_text: pieces[i], embedding: toVector(vec) });
  }
  try {
    await supaUpsert(env, "embeddings", rows);
  } catch (e) {
    return json({ error: e.message }, 502);
  }
  return json({ chunks: rows.length });
}
