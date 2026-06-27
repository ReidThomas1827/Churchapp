import { json, supaConfigured, supaUpsert, supaDelete } from "./_lib.js";

// Store / remove a Web Push subscription (in Supabase, shared with the cron).
export async function onRequestPost({ request, env }) {
  if (!supaConfigured(env)) return json({ error: "Push needs Supabase configured." }, 501);
  const sub = await request.json().catch(() => ({}));
  const keys = sub.keys || {};
  if (!sub.endpoint || !keys.p256dh || !keys.auth) return json({ error: "Invalid subscription." }, 400);
  try {
    await supaUpsert(env, "push_subscriptions", [{ endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth }]);
  } catch (e) {
    return json({ error: e.message }, 502);
  }
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  if (!supaConfigured(env)) return json({ error: "Push needs Supabase configured." }, 501);
  const { endpoint } = await request.json().catch(() => ({}));
  if (!endpoint) return json({ error: "endpoint required" }, 400);
  try {
    await supaDelete(env, "push_subscriptions", "endpoint=eq." + encodeURIComponent(endpoint));
  } catch (e) {
    return json({ error: e.message }, 502);
  }
  return json({ ok: true });
}
