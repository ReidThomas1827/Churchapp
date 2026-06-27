import { json, gemini, geminiEmbed, supaConfigured, supaRpc, toVector } from "./_lib.js";

// Retrieval-augmented answer. If Supabase + embeddings are set up, it retrieves
// the most relevant chunks via pgvector; otherwise it falls back to the local
// transcripts the app sends as `context`.
export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY) return json({ error: "Search not configured. Add GEMINI_API_KEY." }, 501);

  const { query, context } = await request.json().catch(() => ({}));
  if (!query) return json({ error: "No query provided." }, 400);

  let material = context || "";
  if (supaConfigured(env)) {
    try {
      const qvec = await geminiEmbed(env, query);
      const matches = await supaRpc(env, "match_embeddings", { query_embedding: toVector(qvec), match_count: 8 });
      if (Array.isArray(matches) && matches.length) material = matches.map((m) => m.chunk_text).join("\n---\n");
    } catch {
      /* fall back to the context provided by the client */
    }
  }

  const prompt = `Answer the question using ONLY the sermon material below. Cite specifics (titles/dates) where you can. If the answer isn't present, say so plainly.

Question: ${query}

--- Material ---
${String(material).slice(0, 40000)}`;

  try {
    return json({ answer: await gemini(env, prompt) });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}
