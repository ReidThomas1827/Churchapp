import { json, gemini, geminiEmbed, supaConfigured, supaRpc, toVector } from "./_lib.js";

// Retrieval-augmented answer. If Supabase + embeddings are set up, it retrieves
// the most relevant chunks via pgvector; otherwise it falls back to the local
// transcripts the app sends as `context`.
export async function onRequestPost({ request, env }) {
  if (!env.GEMINI_API_KEY) return json({ error: "Search not configured. Add GEMINI_API_KEY." }, 501);

  const { query, context } = await request.json().catch(() => ({}));
  if (!query) return json({ error: "No query provided." }, 400);

  // Blend the best AI-indexed matches (if any) with the full local context the
  // client always sends — indexed matches help focus the answer, but we never
  // drop full coverage in favor of a possibly-incomplete index (older sermons
  // may not be indexed yet; see the "Reindex all" button in Settings).
  let material = context || "";
  if (supaConfigured(env)) {
    try {
      const qvec = await geminiEmbed(env, query);
      const matches = await supaRpc(env, "match_embeddings", { query_embedding: toVector(qvec), match_count: 8 });
      if (Array.isArray(matches) && matches.length) {
        const best = matches.map((m) => m.chunk_text).join("\n---\n");
        material = `--- Most relevant excerpts for this question ---\n${best}\n\n--- Full sermon archive (for anything not covered above) ---\n${material}`;
      }
    } catch {
      /* fall back to just the full context provided by the client */
    }
  }

  const prompt = `Answer the question using ONLY the sermon material below. Cite specifics (titles/dates) where you can. If the answer isn't present, say so plainly.

Question: ${query}

--- Material ---
${String(material).slice(0, 45000)}`;

  try {
    return json({ answer: await gemini(env, prompt) });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}
