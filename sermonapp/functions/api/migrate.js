import { json, supaConfigured, supaUpsert, supaDelete } from "./_lib.js";

// One-time migration: the app sends all of a device's locally-stored records and
// this upserts them into Supabase using the service-role key (so it works even
// if the device hasn't set a client-side anon key). Idempotent — safe to re-run.
export async function onRequestPost({ request, env }) {
  if (!supaConfigured(env)) return json({ error: "Supabase isn't configured on the server." }, 501);

  const { sermons = [], study = [], quizzes = [] } = await request.json().catch(() => ({}));

  const sermonRows = sermons.map((s) => ({
    id: s.id, title: s.title, kind: s.kind || "Sermon", date: s.date,
    attended: s.attended !== false, status: s.status || "recorded",
    duration_sec: s.durationSec || 0, transcript: s.transcript, notes: s.notes,
    mime_type: s.mimeType, created_at: s.createdAt, updated_at: s.updatedAt || s.createdAt,
  }));
  const studyRows = study.map((e) => ({
    id: e.id, date: e.date, reference: e.reference, status: e.status || "planned",
    created_at: e.createdAt, updated_at: e.updatedAt || e.createdAt,
  }));
  const quizRows = quizzes.map((q) => ({
    id: q.id, source_type: q.sourceType, title: q.title, score: q.score, total: q.total, taken_at: q.takenAt,
  }));

  try {
    if (sermonRows.length) await supaUpsert(env, "sermons", sermonRows);
    if (studyRows.length) await supaUpsert(env, "study_plan", studyRows);
    if (quizRows.length) await supaUpsert(env, "quiz_history", quizRows);
  } catch (e) {
    return json({ error: e.message }, 502);
  }

  return json({ sermons: sermonRows.length, study: studyRows.length, quizzes: quizRows.length });
}

// Delete a sermon or study entry from the cloud by id (keeps devices in sync
// when something is deleted locally).
export async function onRequestDelete({ request, env }) {
  if (!supaConfigured(env)) return json({ error: "Supabase isn't configured." }, 501);
  const { sermonId, studyId } = await request.json().catch(() => ({}));
  if (!sermonId && !studyId) return json({ error: "sermonId or studyId required" }, 400);
  try {
    if (sermonId) await supaDelete(env, "sermons", "id=eq." + encodeURIComponent(sermonId));
    if (studyId) await supaDelete(env, "study_plan", "id=eq." + encodeURIComponent(studyId));
  } catch (e) {
    return json({ error: e.message }, 502);
  }
  return json({ ok: true });
}
