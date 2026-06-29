// Autonomous offline-first sync, routed through the backend (which holds the
// service-role key). IndexedDB stays the working store; every change is pushed
// to the cloud on save, and the cloud is pulled on launch — no per-device key
// setup. All calls are fire-and-forget and never throw into the UI; if the
// backend has no Supabase configured they simply no-op. Audio is never uploaded.
import * as db from "./db.js";
import { apiUrl } from "./config.js";

const warn = (e) => console.warn("[sync]", e && e.message ? e.message : e);
const newer = (a, b) => (a || "") > (b || "");

function post(path, body) {
  return fetch(apiUrl(path), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }).then((r) => { if (!r.ok) throw new Error("sync " + r.status); });
}
function del(path, body) {
  return fetch(apiUrl(path), {
    method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }).then((r) => { if (!r.ok) throw new Error("sync del " + r.status); });
}

// Per-mutation pushes (called from the store on every change).
export function pushSermon(s) { post("/api/migrate", { sermons: [s] }).catch(warn); }
export function pushStudy(e) { post("/api/migrate", { study: [e] }).catch(warn); }
export function pushQuiz(q) { post("/api/migrate", { quizzes: [q] }).catch(warn); }
export function removeSermonRemote(id) { del("/api/migrate", { sermonId: id }).catch(warn); }
export function removeStudyRemote(id) { del("/api/migrate", { studyId: id }).catch(warn); }

// Pull cloud → local on launch. Returns true if anything changed locally.
export async function pullAll() {
  let changed = false;
  try {
    const res = await fetch(apiUrl("/api/pull"));
    if (!res.ok) return false;
    const data = await res.json();
    for (const s of data.sermons || []) {
      const local = await db.get("sermons", s.id);
      if (!local || newer(s.updatedAt, local.updatedAt || local.createdAt)) { await db.put("sermons", s); changed = true; }
    }
    for (const e of data.study || []) {
      const local = await db.get("study", e.id);
      if (!local || newer(e.updatedAt, local.updatedAt || local.createdAt)) { await db.put("study", e); changed = true; }
    }
    for (const q of data.quizzes || []) {
      if (!(await db.get("quizHistory", q.id))) { await db.put("quizHistory", q); changed = true; }
    }
  } catch (e) { warn(e); }
  return changed;
}

// Push every local record up (used by the one-time migrate / manual sync).
export async function pushAll() {
  try {
    const [sermons, study, quizzes] = await Promise.all([db.getAll("sermons"), db.getAll("study"), db.getAll("quizHistory")]);
    if (sermons.length || study.length || quizzes.length) await post("/api/migrate", { sermons, study, quizzes });
  } catch (e) { warn(e); }
}

export async function syncNow() { await pushAll(); return pullAll(); }
