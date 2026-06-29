import { el, todayISO } from "../ui.js";
import { apiUrl } from "../config.js";
import { latestQuizSermon, listStudy, lastScore } from "../store.js";
import { openQuiz } from "./quiz.js";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function fmtMin(min) {
  if (min == null) return "";
  const h = Math.floor(min / 60), m = min % 60;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
function reminderNote(sched, minKey, sentKey) {
  if (!sched || sched[minKey] == null) return "";
  return sched[sentKey] ? `🔔 Reminder sent ~${fmtMin(sched[minKey])}` : `🔔 Reminder set for ${fmtMin(sched[minKey])}`;
}

function quizCard({ tag, title, sub, note, onClick }) {
  return el("div", { class: "card spread", style: "margin-bottom:14px" }, [
    el("div", {}, [
      el("span", { class: "tag accent", text: tag }),
      el("div", { style: "margin-top:8px;font-weight:650", text: title }),
      el("div", { class: "small muted", text: sub }),
      note ? el("div", { class: "small muted", text: note }) : null,
    ]),
    el("button", { class: "btn primary", style: "width:auto;flex:none", onClick }, "Take quiz"),
  ]);
}

// Renders, at the top of the Record tab: a one-time install hint, plus any
// available daily quizzes (latest sermon + a study passage scheduled today).
export async function renderDaily(root) {
  root.innerHTML = "";

  if (!isStandalone() && !localStorage.getItem("sn_install_dismissed")) {
    const hint = el("div", { class: "card spread", style: "margin-bottom:14px" }, [
      el("div", { class: "small" }, [
        el("strong", { text: "Add to your Home Screen " }),
        el("span", { class: "muted", text: "— open from Safari’s Share menu for full-screen use and notifications." }),
      ]),
      el("button", {
        class: "icon-btn", "aria-label": "Dismiss", html: "✕",
        onClick: () => { localStorage.setItem("sn_install_dismissed", "1"); hint.remove(); },
      }),
    ]);
    root.appendChild(hint);
  }

  let sched = null;
  try { const s = await fetch(apiUrl("/api/notify-status")).then((r) => (r.ok ? r.json() : null)); sched = s && s.schedule; } catch {}

  const sermon = await latestQuizSermon();
  if (sermon) {
    const prev = await lastScore("sermon", sermon.title);
    root.appendChild(quizCard({
      tag: "Today’s sermon quiz",
      title: sermon.title,
      sub: prev ? `Last score: ${prev.score}/${prev.total}` : "Not taken yet",
      note: reminderNote(sched, "sermonMin", "sermonSent"),
      onClick: () => openQuiz({ type: "sermon", title: sermon.title, transcript: sermon.transcript }),
    }));
  }

  const studyToday = (await listStudy()).find((e) => e.date === todayISO());
  if (studyToday) {
    const prev = await lastScore("study", studyToday.reference);
    root.appendChild(quizCard({
      tag: "Today’s study quiz",
      title: studyToday.reference,
      sub: prev ? `Last score: ${prev.score}/${prev.total}` : "Not taken yet",
      note: reminderNote(sched, "studyMin", "studySent"),
      onClick: () => openQuiz({ type: "study", reference: studyToday.reference, title: studyToday.reference }),
    }));
  }
}
