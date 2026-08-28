import { json, supaConfigured, supaSelect } from "./_lib.js";

// Read-only status for the quiz cards: today's sermon-reminder schedule, plus
// whichever study entry is currently "live" (logged on a prior day, not yet
// notified) and today's check time for it.
function localDay(tz) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function localDayOf(isoString, tz) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const p = Object.fromEntries(fmt.formatToParts(new Date(isoString)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export async function onRequestGet({ env }) {
  if (!supaConfigured(env)) return json({ error: "Supabase isn't configured." }, 501);
  const tz = env.QUIZ_TZ || "America/New_York";
  const day = localDay(tz);
  try {
    const schedRows = await supaSelect(env, "notify_schedule", `day=eq.${day}&select=*`);
    const sched = schedRows[0] || null;

    let study = null;
    try {
      const latest = (await supaSelect(env, "study_plan", "select=reference,created_at,notified&order=created_at.desc&limit=1"))[0];
      if (latest) {
        const loggedDay = localDayOf(latest.created_at, tz);
        if (loggedDay < day) study = { reference: latest.reference, notified: !!latest.notified, checkAfterMin: sched ? sched.study_min : null };
      }
    } catch { /* study_plan.notified may not exist yet */ }

    return json({
      day,
      schedule: sched ? { sermonMin: sched.sermon_min, sermonSent: !!sched.sermon_sent } : null,
      study,
    });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}
