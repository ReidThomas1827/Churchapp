// Minimal Supabase REST client for the browser, using the user's URL + anon key
// from Settings. No SDK needed — PostgREST is just HTTP.
import { CONFIG, hasSupabase } from "./config.js";

const base = () => CONFIG.supabaseUrl.replace(/\/+$/, "");
function headers(extra) {
  return {
    apikey: CONFIG.supabaseAnonKey,
    Authorization: "Bearer " + CONFIG.supabaseAnonKey,
    "Content-Type": "application/json",
    ...extra,
  };
}

export { hasSupabase };

export async function sbSelect(table, query = "select=*") {
  const r = await fetch(`${base()}/rest/v1/${table}?${query}`, { headers: headers() });
  if (!r.ok) throw new Error(`${table} select ${r.status}: ${await r.text()}`);
  return r.json();
}

export async function sbUpsert(table, rows) {
  if (!rows.length) return;
  const r = await fetch(`${base()}/rest/v1/${table}`, {
    method: "POST",
    headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`${table} upsert ${r.status}: ${await r.text()}`);
}

export async function sbDelete(table, query) {
  const r = await fetch(`${base()}/rest/v1/${table}?${query}`, { method: "DELETE", headers: headers() });
  if (!r.ok) throw new Error(`${table} delete ${r.status}: ${await r.text()}`);
}
