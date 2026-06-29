import { json, supaConfigured, supaSelect } from "./_lib.js";

// Returns all cloud records (in the app's local shape) so any device can pull
// them on launch. Audio is never stored in the cloud, so it's not included.
export async function onRequestGet({ env }) {
  if (!supaConfigured(env)) return json({ error: "Supabase isn't configured." }, 501);
  try {
    const [sermons, study, quizzes] = await Promise.all([
      supaSelect(env, "sermons", "select=*"),
      supaSelect(env, "study_plan", "select=*"),
      supaSelect(env, "quiz_history", "select=*"),
    ]);
    let folders = [];
    try { folders = await supaSelect(env, "folders", "select=*"); } catch { /* folders table may not exist yet */ }

    return json({
      sermons: sermons.map((r) => ({
        id: r.id, title: r.title, kind: r.kind || "Sermon", speaker: r.speaker || "", date: r.date,
        attended: r.attended, status: r.status, durationSec: Number(r.duration_sec) || 0,
        transcript: r.transcript, notes: r.notes, mimeType: r.mime_type,
        quizPinned: !!r.quiz_pinned, folderId: r.folder_id || null,
        createdAt: r.created_at, updatedAt: r.updated_at,
      })),
      study: study.map((r) => ({ id: r.id, date: r.date, reference: r.reference, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at })),
      quizzes: quizzes.map((r) => ({ id: r.id, sourceType: r.source_type, title: r.title, score: r.score, total: r.total, takenAt: r.taken_at })),
      folders: folders.map((r) => ({ id: r.id, name: r.name, parentId: r.parent_id || null, createdAt: r.created_at, updatedAt: r.updated_at })),
    });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}
