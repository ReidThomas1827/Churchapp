import { renderRecord } from "./views/record.js";
import { renderArchive } from "./views/archive.js";
import { renderStudy } from "./views/study.js";
import { renderSearch } from "./views/search.js";
import { openSettings } from "./views/settings.js";
import { openQuiz } from "./views/quiz.js";
import { latestQuizSermon, listStudy } from "./store.js";
import { todayISO, toast } from "./ui.js";
import { pullAll } from "./sync.js";

const byId = (id) => document.getElementById(id);

const views = {
  record: { el: byId("view-record"), title: "Record" },
  archive: { el: byId("view-archive"), title: "Archive" },
  study: { el: byId("view-study"), title: "Study Plan" },
  search: { el: byId("view-search"), title: "Search" },
};

function render(name) {
  const root = views[name].el;
  if (name === "record") renderRecord(root, { onSaved: () => switchTab("archive") });
  else if (name === "archive") renderArchive(root);
  else if (name === "study") renderStudy(root);
  else if (name === "search") renderSearch(root);
}

let current = "record";
function switchTab(name) {
  current = name;
  for (const [k, v] of Object.entries(views)) v.el.hidden = k !== name;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.tab === name));
  byId("topbar-title").textContent = views[name].title;
  render(name);
}

document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.tab)));
byId("settings-btn").addEventListener("click", openSettings);

// ---- Daily-quiz deep links (used by the push notifications) ----
async function takeSermonQuiz() {
  const s = await latestQuizSermon();
  if (!s) return toast("No sermon quiz is available yet.");
  openQuiz({ type: "sermon", title: s.title, transcript: s.transcript });
}
async function takeStudyQuiz() {
  const entries = await listStudy();
  const e = entries.find((x) => x.date === todayISO()) || entries[0];
  if (!e) return toast("No study passage is planned.");
  openQuiz({ type: "study", reference: e.reference, title: e.reference });
}
function handleRoute(target) {
  if (!target) return;
  if (target.indexOf("quiz-sermon") >= 0) takeSermonQuiz();
  else if (target.indexOf("quiz-study") >= 0) takeStudyQuiz();
}

switchTab("record");
handleRoute(location.hash);
window.addEventListener("hashchange", () => handleRoute(location.hash));

// Pull any changes from the cloud on launch, then refresh the open tab if anything changed.
pullAll().then((changed) => { if (changed) render(current); }).catch(() => {});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  // Notification taps on an already-open app arrive as a message.
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data && e.data.type === "navigate") handleRoute(e.data.url);
  });
}
