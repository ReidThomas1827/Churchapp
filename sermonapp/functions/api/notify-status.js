import { json, supaConfigured, supaSelect } from "./_lib.js";

// Read-only: today's notification schedule (the random times + whether each was
// sent), so the app can show "reminder sent / set for ..." on the quiz cards.
function localDay(tz) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export async function onRequestGet({ env }) {
  if (!supaConfigured(env)) return json({ error: "Supabase isn't configured." }, 501);
  const day = localDay(env.QUIZ_TZ || "America/New_York");
  try {
    const rows = await supaSelect(env, "notify_schedule", `day=eq.${day}&select=*`);
    const r = rows[0] || null;
    return json({
      day,
      schedule: r ? { sermonMin: r.sermon_min, studyMin: r.study_min, sermonSent: !!r.sermon_sent, studySent: !!r.study_sent } : null,
    });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}
