// Client for the Cloudflare Pages Functions in /functions/api/*.
// Each function returns a clear error (HTTP 501) when its API key isn't set,
// which we surface to the user as a "configure in Settings" hint.
import { apiUrl } from "./config.js";

async function handle(res) {
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

function postJSON(path, payload) {
  return fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(handle);
}

// Send raw audio bytes; the function forwards them to Deepgram.
export function transcribe(blob, mimeType) {
  return fetch(apiUrl("/api/transcribe"), {
    method: "POST",
    headers: { "Content-Type": mimeType || "application/octet-stream" },
    body: blob,
  }).then(handle); // { transcript }
}

export function generateNotes(transcript) {
  return postJSON("/api/notes", { transcript }); // { notes }
}

export function generateQuiz(payload) {
  return postJSON("/api/quiz", payload); // { questions }
}

export function search(query, context) {
  return postJSON("/api/search", { query, context }); // { answer }
}

// Index a sermon into pgvector for global search (no-op server-side if Supabase
// isn't configured). Fire-and-forget from the UI.
export function embedSermon(payload) {
  return postJSON("/api/embed", payload); // { chunks }
}

// One-time push of all local records to Supabase via the service-role backend.
export function migrateToCloud(payload) {
  return postJSON("/api/migrate", payload); // { sermons, study, quizzes }
}

// List every Notion page/database shared with the integration, for the export picker.
export function listNotionDestinations() {
  return fetch(apiUrl("/api/notion-destinations")).then(handle); // { items: [{id, type, title}] }
}

// Export a sermon to Notion as a new page (sub-page or database row).
// payload = { ...sermon fields, targetId, targetType }
export function exportNotion(payload) {
  return postJSON("/api/notion", payload); // { url }
}
