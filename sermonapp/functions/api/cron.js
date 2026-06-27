import { json, supaConfigured, supaSelect, supaUpsert, supaDelete } from "./_lib.js";
import { sendPush } from "./_webpush.js";

// Called on a schedule by an external trigger (e.g. cron-job.org) every ~15 min,
// Mon–Sat, with ?key=CRON_SECRET. Each day it rolls one random time per quiz in
// the 9am–9pm window and fires the push once that time has passed.

const WINDOW_START = 9 * 60;   // 9:00
const WINDOW_END = 21 * 60;    // 21:00
const randMin = () => WINDOW_START + Math.floor(Math.random() * (WINDOW_END - WINDOW_START));

function localParts(tz) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: (parseInt(p.hour) % 24) * 60 + parseInt(p.minute), weekday: p.weekday };
}

async function sendToAll(env, payload) {
  const subs = await supaSelect(env, "push_subscriptions");
  const vapid = {
    publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT || "mailto:admin@example.com",
  };
  let sent = 0;
  for (const s of subs) {
    try {
      const status = await sendPush({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, payload, vapid);
      if (status === 404 || status === 410) await supaDelete(env, "push_subscriptions", "endpoint=eq." + encodeURIComponent(s.endpoint));
      else if (status >= 200 && status < 300) sent++;
    } catch { /* skip this subscription */ }
  }
  return sent;
}

export async function onRequest({ request, env }) {
  if (!supaConfigured(env)) return json({ error: "cron needs Supabase." }, 501);
  if (!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)) return json({ error: "cron needs VAPID keys." }, 501);

  const url = new URL(request.url);
  if (!env.CRON_SECRET || url.searchParams.get("key") !== env.CRON_SECRET) return json({ error: "unauthorized" }, 401);

  const { day, minutes, weekday } = localParts(env.QUIZ_TZ || "America/New_York");
  if (weekday === "Sun") return json({ skipped: "sunday" });

  let sched = (await supaSelect(env, "notify_schedule", `day=eq.${day}&select=*`))[0];
  if (!sched) {
    sched = { day, sermon_min: randMin(), study_min: randMin(), sermon_sent: false, study_sent: false };
    await supaUpsert(env, "notify_schedule", [sched]);
  }

  const out = { day, minutes, sermonSent: 0, studySent: 0 };

  // Sermon quiz — paused unless the latest sermon was attended + transcribed.
  if (!sched.sermon_sent && minutes >= sched.sermon_min) {
    const latest = (await supaSelect(env, "sermons", "select=attended,transcript&order=date.desc&limit=1"))[0];
    if (latest && latest.attended && latest.transcript) {
      out.sermonSent = await sendToAll(env, { title: "Sermon quiz", body: "Tap to test yourself on Sunday's sermon.", url: "./index.html#quiz-sermon" });
    }
    sched.sermon_sent = true;
    await supaUpsert(env, "notify_schedule", [sched]);
  }

  // Study quiz — only when a passage is scheduled for today.
  if (!sched.study_sent && minutes >= sched.study_min) {
    const today = (await supaSelect(env, "study_plan", `date=eq.${day}&select=reference&limit=1`))[0];
    if (today) {
      out.studySent = await sendToAll(env, { title: "Study plan quiz", body: `Today's passage: ${today.reference}`, url: "./index.html#quiz-study" });
    }
    sched.study_sent = true;
    await supaUpsert(env, "notify_schedule", [sched]);
  }

  return json(out);
}
