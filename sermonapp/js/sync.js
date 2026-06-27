// Offline-first sync. IndexedDB stays the working source of truth; this layer
// mirrors text data (sermons, study plan, quiz scores) to Supabase so it's
// backed up and available on other devices. Audio is never uploaded.
// Every function is a no-op when sync isn't configured and never throws into
// the UI — a failed sync just logs and the local app keeps working.
import * as db from "./db.js";
import { hasSupabase, sbSelect, sbUpsert, sbDelete } from "./supabase.js";

export const syncEnabled = hasSupabase;

const sermonToRow = (s) => ({
  id: s.id, title: s.title, kind: s.kind || "Sermon", date: s.date, attended: s.attended, status: s.status,
  duration_sec: s.durationSec || 0, transcript: s.transcript, notes: s.notes,
  mime_type: s.mimeType, created_at: s.createdAt, updated_at: s.updatedAt || s.createdAt,
});
const sermonFromRow = (r) => ({
  id: r.id, title: r.title, kind: r.kind, date: r.date, attended: r.attended, status: r.status,
  durationSec: Number(r.duration_sec) || 0, transcript: r.transcript, notes: r.notes,
  mimeType: r.mime_type, createdAt: r.created_at, updatedAt: r.updated_at,
});
const studyToRow = (e) => ({ id: e.id, date: e.date, reference: e.reference, status: e.status, created_at: e.createdAt, updated_at: e.updatedAt || e.createdAt });
const studyFromRow = (r) => ({ id: r.id, date: r.date, reference: r.reference, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at });
const quizToRow = (q) => ({ id: q.id, source_type: q.sourceType, title: q.title, score: q.score, total: q.total, taken_at: q.takenAt });
const quizFromRow = (r) => ({ id: r.id, sourceType: r.source_type, title: r.title, score: r.score, total: r.total, takenAt: r.taken_at });

const warn = (e) => console.warn("[sync]", e && e.message ? e.message : e);

export function pushSermon(s) { if (syncEnabled()) sbUpsert("sermons", [sermonToRow(s)]).catch(warn); }
export function pushStudy(e) { if (syncEnabled()) sbUpsert("study_plan", [studyToRow(e)]).catch(warn); }
export function pushQuiz(q) { if (syncEnabled()) sbUpsert("quiz_history", [quizToRow(q)]).catch(warn); }
export function removeSermonRemote(id) { if (syncEnabled()) sbDelete("sermons", "id=eq." + id).catch(warn); }
export function removeStudyRemote(id) { if (syncEnabled()) sbDelete("study_plan", "id=eq." + id).catch(warn); }

const newer = (a, b) => (a || "") > (b || "");

// Pull remote → local, keeping whichever row was updated most recently.
export async function pullAll() {
  if (!syncEnabled()) return;
  try {
    const [sermons, study, quizzes] = await Promise.all([
      sbSelect("sermons"), sbSelect("study_plan"), sbSelect("quiz_history"),
    ]);
    for (const r of sermons) {
      const remote = sermonFromRow(r), local = await db.get("sermons", remote.id);
      if (!local || newer(remote.updatedAt, local.updatedAt || local.createdAt)) await db.put("sermons", remote);
    }
    for (const r of study) {
      const remote = studyFromRow(r), local = await db.get("study", remote.id);
      if (!local || newer(remote.updatedAt, local.updatedAt || local.createdAt)) await db.put("study", remote);
    }
    for (const r of quizzes) {
      if (!(await db.get("quizHistory", r.id))) await db.put("quizHistory", quizFromRow(r));
    }
  } catch (e) { warn(e); }
}

// Push every local row up (used right after the user first adds their keys).
export async function pushAll() {
  if (!syncEnabled()) return;
  try {
    await sbUpsert("sermons", (await db.getAll("sermons")).map(sermonToRow));
    await sbUpsert("study_plan", (await db.getAll("study")).map(studyToRow));
    await sbUpsert("quiz_history", (await db.getAll("quizHistory")).map(quizToRow));
  } catch (e) { warn(e); }
}

export async function syncNow() { await pushAll(); await pullAll(); }
