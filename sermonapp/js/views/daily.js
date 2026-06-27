import { el, todayISO } from "../ui.js";
import { latestQuizSermon, listStudy, lastScore } from "../store.js";
import { openQuiz } from "./quiz.js";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function quizCard({ tag, title, sub, onClick }) {
  return el("div", { class: "card spread", style: "margin-bottom:14px" }, [
    el("div", {}, [
      el("span", { class: "tag accent", text: tag }),
      el("div", { style: "margin-top:8px;font-weight:650", text: title }),
      el("div", { class: "small muted", text: sub }),
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

  const sermon = await latestQuizSermon();
  if (sermon) {
    const prev = await lastScore("sermon", sermon.title);
    root.appendChild(quizCard({
      tag: "Today’s sermon quiz",
      title: sermon.title,
      sub: prev ? `Last score: ${prev.score}/${prev.total}` : "Not taken yet",
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
      onClick: () => openQuiz({ type: "study", reference: studyToday.reference, title: studyToday.reference }),
    }));
  }
}
