import { json, supaConfigured } from "./_lib.js";

// Reports which integrations are configured (never the secret values) and hands
// the app the VAPID public key it needs to subscribe to push.
export const onRequestGet = ({ env }) =>
  json({
    deepgram: !!env.DEEPGRAM_API_KEY,
    gemini: !!env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL || "gemini-2.0-flash",
    supabase: supaConfigured(env),
    push: !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
    vapidPublicKey: env.VAPID_PUBLIC_KEY || "",
    diag: 3,
    envKeys: Object.keys(env),
    sr_len: (env.SUPABASE_SERVICE_ROLE || "").length,
    sr_ws: /^\s|\s$/.test(env.SUPABASE_SERVICE_ROLE || ""),
    sr_fmt: (env.SUPABASE_SERVICE_ROLE || "").startsWith("sb_secret_"),
    url_val: env.SUPABASE_URL || "",
    url_ws: /^\s|\s$/.test(env.SUPABASE_URL || ""),
  });
