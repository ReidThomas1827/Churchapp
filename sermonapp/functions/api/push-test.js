import { json, supaConfigured, supaSelect, supaDelete } from "./_lib.js";
import { sendPush } from "./_webpush.js";

// Sends a one-off test notification to every subscribed device immediately
// (bypasses the daily schedule). Protected by CRON_SECRET: /api/push-test?key=...
export async function onRequest({ request, env }) {
  if (!supaConfigured(env)) return json({ error: "needs Supabase" }, 501);
  if (!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)) return json({ error: "needs VAPID keys" }, 501);

  const url = new URL(request.url);
  if (!env.CRON_SECRET || url.searchParams.get("key") !== env.CRON_SECRET) return json({ error: "unauthorized" }, 401);

  const subs = await supaSelect(env, "push_subscriptions");
  const vapid = {
    publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT || "mailto:admin@example.com",
  };

  const results = [];
  for (const s of subs) {
    try {
      const status = await sendPush(
        { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
        { title: "Sermon Notes", body: "✅ Your notifications are working!", url: "./index.html" },
        vapid
      );
      if (status === 404 || status === 410) await supaDelete(env, "push_subscriptions", "endpoint=eq." + encodeURIComponent(s.endpoint));
      results.push(status);
    } catch (e) {
      results.push("error: " + e.message);
    }
  }
  return json({ subscriptions: subs.length, results });
}
