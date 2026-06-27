// Domain operations over IndexedDB. These mirror the eventual Supabase tables
// so syncing can be layered on later without changing callers.
import * as db from "./db.js";
import { uid } from "./ui.js";
import { pushSermon, pushStudy, pushQuiz, removeSermonRemote, removeStudyRemote } from "./sync.js";

// Sermon status: recorded | transcribing | transcribed | noting | noted | skipped | error
export async function listSermons() {
  const all = await db.getAll("sermons");
  return all.sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
}

export function getSermon(id) { return db.get("sermons", id); }
export function saveSermon(s) {
  s.updatedAt = new Date().toISOString();
  const p = db.put("sermons", s);
  pushSermon(s);
  return p;
}

export async function createSermon({ title, kind, date, attended, blob, mimeType, durationSec }) {
  const s = {
    id: uid(),
    title,
    kind: kind || "Sermon",
    date,
    attended: attended !== false,
    mimeType: mimeType || null,
    durationSec: durationSec || 0,
    status: attended === false ? "skipped" : "recorded",
    transcript: null,
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.put("sermons", s);
  if (blob) await db.put("audio", blob, s.id);
  pushSermon(s);
  return s;
}

export function getAudio(id) { return db.get("audio", id); }

export async function deleteSermon(id) {
  await db.del("sermons", id);
  await db.del("audio", id);
  removeSermonRemote(id);
}

// Drop just the audio (after transcription) to free space; keeps transcript/notes.
export async function dropAudio(id) {
  await db.del("audio", id);
}

// Most recent attended + transcribed sermon — the quiz source. Returns null if
// the latest week was "not attending" (quizzes pause) or nothing is ready.
export async function latestQuizSermon() {
  const all = await listSermons();
  if (!all.length) return null;
  if (all[0].attended === false) return null; // paused this week
  return all.find((s) => s.attended && s.transcript) || null;
}

// ---- Study plan ----
export async function listStudy() {
  const all = await db.getAll("study");
  return all.sort((a, b) => b.date.localeCompare(a.date));
}
export async function addStudy({ date, reference }) {
  const entry = { id: uid(), date, reference, status: "planned", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await db.put("study", entry);
  pushStudy(entry);
  return entry;
}
export function saveStudy(entry) {
  entry.updatedAt = new Date().toISOString();
  const p = db.put("study", entry);
  pushStudy(entry);
  return p;
}
export function deleteStudy(id) {
  const p = db.del("study", id);
  removeStudyRemote(id);
  return p;
}

// ---- Quiz history ----
export function addQuizResult(result) {
  const row = { id: uid(), takenAt: new Date().toISOString(), ...result };
  const p = db.put("quizHistory", row);
  pushQuiz(row);
  return p;
}
export async function listQuizHistory() {
  const all = await db.getAll("quizHistory");
  return all.sort((a, b) => b.takenAt.localeCompare(a.takenAt));
}
// Most recent result for a given quiz source (by type + title/reference).
export async function lastScore(sourceType, title) {
  const all = await listQuizHistory();
  return all.find((r) => r.sourceType === sourceType && r.title === title) || null;
}
