import { json, supaConfigured, supaUpsert, supaDelete } from "./_lib.js";

// Upsert records into Supabase via the service-role key. Used both by the
// one-time "Migrate to cloud" button and by the autonomous per-change sync.
export async function onRequestPost({ request, env }) {
  if (!supaConfigured(env)) return json({ error: "Supabase isn't configured on the server." }, 501);

  const { sermons = [], study = [], quizzes = [], folders = [] } = await request.json().catch(() => ({}));

  const sermonRows = sermons.map((s) => ({
    id: s.id, title: s.title, kind: s.kind || "Sermon", speaker: s.speaker || null, date: s.date,
    attended: s.attended !== false, status: s.status || "recorded",
    duration_sec: s.durationSec || 0, transcript: s.transcript, notes: s.notes,
    mime_type: s.mimeType, quiz_pinned: !!s.quizPinned, folder_id: s.folderId || null,
    created_at: s.createdAt, updated_at: s.updatedAt || s.createdAt,
  }));
  const studyRows = study.map((e) => ({ id: e.id, date: e.date, reference: e.reference, status: e.status || "planned", created_at: e.createdAt, updated_at: e.updatedAt || e.createdAt }));
  const quizRows = quizzes.map((q) => ({ id: q.id, source_type: q.sourceType, title: q.title, score: q.score, total: q.total, taken_at: q.takenAt }));
  const folderRows = folders.map((f) => ({ id: f.id, name: f.name, parent_id: f.parentId || null, created_at: f.createdAt, updated_at: f.updatedAt || f.createdAt }));

  try {
    if (sermonRows.length) await upsertSermons(env, sermonRows);
    if (studyRows.length) await supaUpsert(env, "study_plan", studyRows);
    if (quizRows.length) await supaUpsert(env, "quiz_history", quizRows);
    if (folderRows.length) { try { await supaUpsert(env, "folders", folderRows); } catch { /* folders table may not exist yet */ } }
  } catch (e) {
    return json({ error: e.message }, 502);
  }

  return json({ sermons: sermonRows.length, study: studyRows.length, quizzes: quizRows.length, folders: folderRows.length });
}

// Upsert sermons; if the newer columns (speaker/quiz_pinned/folder_id) aren't in
// the DB yet, retry without them so sync keeps working until the one-time SQL
// upgrade is run.
async function upsertSermons(env, rows) {
  try {
    await supaUpsert(env, "sermons", rows);
  } catch (e) {
    if (/column|schema cache|could not find/i.test(e.message || "")) {
      const basic = rows.map(({ speaker, quiz_pinned, folder_id, ...rest }) => rest);
      await supaUpsert(env, "sermons", basic);
    } else throw e;
  }
}

// Delete a sermon, study entry, or folder from the cloud by id.
export async function onRequestDelete({ request, env }) {
  if (!supaConfigured(env)) return json({ error: "Supabase isn't configured." }, 501);
  const { sermonId, studyId, folderId } = await request.json().catch(() => ({}));
  if (!sermonId && !studyId && !folderId) return json({ error: "sermonId, studyId or folderId required" }, 400);
  try {
    if (sermonId) await supaDelete(env, "sermons", "id=eq." + encodeURIComponent(sermonId));
    if (studyId) await supaDelete(env, "study_plan", "id=eq." + encodeURIComponent(studyId));
    if (folderId) { try { await supaDelete(env, "folders", "id=eq." + encodeURIComponent(folderId)); } catch { /* folders table may not exist yet */ } }
  } catch (e) {
    return json({ error: e.message }, 502);
  }
  return json({ ok: true });
}
