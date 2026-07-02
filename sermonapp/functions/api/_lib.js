// Shared helpers for the Pages Functions. Files starting with "_" are not
// routed, so this is import-only.

export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

// Call Google Gemini. Set wantJSON to parse a JSON response (falls back to
// { raw } if the model doesn't return clean JSON).
export async function gemini(env, prompt, { wantJSON = false, temperature } = {}) {
  const model = env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
  const body = { contents: [{ parts: [{ text: prompt }] }] };
  const gc = {};
  if (wantJSON) gc.responseMimeType = "application/json";
  if (temperature != null) gc.temperature = temperature;
  if (Object.keys(gc).length) body.generationConfig = gc;

  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("Gemini error: " + (await r.text()));

  const data = await r.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  if (!wantJSON) return text;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

// ---- Supabase (service-role, server side only) ----
export const supaConfigured = (env) => !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE);
const supaBase = (env) => (env.SUPABASE_URL || "").replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
const supaHeaders = (env, extra) => ({
  apikey: env.SUPABASE_SERVICE_ROLE,
  Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE,
  "Content-Type": "application/json",
  ...extra,
});

export async function supaSelect(env, table, query = "select=*") {
  const r = await fetch(`${supaBase(env)}/rest/v1/${table}?${query}`, { headers: supaHeaders(env) });
  if (!r.ok) throw new Error(`supa select ${table} ${r.status}: ${await r.text()}`);
  return r.json();
}
export async function supaUpsert(env, table, rows) {
  if (!rows.length) return;
  const r = await fetch(`${supaBase(env)}/rest/v1/${table}`, {
    method: "POST",
    headers: supaHeaders(env, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`supa upsert ${table} ${r.status}: ${await r.text()}`);
}
export async function supaDelete(env, table, query) {
  const r = await fetch(`${supaBase(env)}/rest/v1/${table}?${query}`, { method: "DELETE", headers: supaHeaders(env) });
  if (!r.ok) throw new Error(`supa delete ${table} ${r.status}: ${await r.text()}`);
}
export async function supaRpc(env, fn, args) {
  const r = await fetch(`${supaBase(env)}/rest/v1/rpc/${fn}`, { method: "POST", headers: supaHeaders(env), body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`supa rpc ${fn} ${r.status}: ${await r.text()}`);
  return r.json();
}

// Gemini embeddings → number[] (text-embedding-004 = 768 dims).
export async function geminiEmbed(env, text) {
  const model = env.GEMINI_EMBED_MODEL || "text-embedding-004";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${env.GEMINI_API_KEY}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: `models/${model}`, content: { parts: [{ text: String(text).slice(0, 8000) }] } }),
  });
  if (!r.ok) throw new Error("Gemini embed error: " + (await r.text()));
  const data = await r.json();
  return (data.embedding && data.embedding.values) || [];
}

// pgvector literal for REST/RPC: "[0.1,0.2,...]"
export const toVector = (arr) => "[" + arr.join(",") + "]";
