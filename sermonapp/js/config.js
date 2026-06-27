// Runtime configuration. Defaults are blank so the app runs locally with no
// cloud accounts; the Settings panel saves overrides into localStorage.
const DEFAULTS = {
  apiBase: "",          // "" = same origin (Cloudflare Pages Functions at /api/*)
  supabaseUrl: "",
  supabaseAnonKey: "",  // the anon key is public by design (protected by RLS)
};

function read() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem("sn_config") || "{}"); } catch {}
  return { ...DEFAULTS, ...saved };
}

export let CONFIG = read();

export function saveConfig(patch) {
  CONFIG = { ...CONFIG, ...patch };
  localStorage.setItem("sn_config", JSON.stringify(CONFIG));
  return CONFIG;
}

export function hasSupabase() {
  return !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
}

export function apiUrl(path) {
  return (CONFIG.apiBase || "") + path;
}
