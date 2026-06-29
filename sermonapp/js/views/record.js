import { el, toast, modal, fmtDuration, todayISO } from "../ui.js";
import { Recorder, recordingSupported } from "../recorder.js";
import { createSermon, listSermons } from "../store.js";
import { renderDaily } from "./daily.js";

// Kept at module scope so a recording survives tab switches / re-renders.
let rec = null;
let ui = null;

export function renderRecord(root, { onSaved } = {}) {
  root.innerHTML = "";

  const daily = el("div", { class: "daily" });
  root.appendChild(daily);
  renderDaily(daily);

  if (!recordingSupported()) {
    root.appendChild(el("div", { class: "card center stack" }, [
      el("h3", { text: "Recording isn't available here" }),
      el("p", { class: "muted small", text: "This browser can't access the microphone. On iPhone, open the app in Safari (or from the Home Screen)." }),
    ]));
    return;
  }

  const timer = el("div", { class: "rec-timer", text: "0:00" });
  const status = el("div", { class: "rec-status", text: "Ready to record" });
  const meter = el("div", { class: "level-meter" }, Array.from({ length: 9 }, () => el("div", { class: "bar" })));
  const bars = [...meter.children];
  const btn = el("button", { class: "record-btn", "aria-label": "Start recording" }, el("div", { class: "dot" }));
  const hint = el("div", { class: "hint", text: "Keep this screen open while recording — locking the phone or switching apps stops capture." });
  const skip = el("button", { class: "btn ghost", style: "margin-top:24px;max-width:340px", onClick: () => notAttendingModal(onSaved) }, "I'm not attending this week");

  root.appendChild(el("div", { class: "recorder" }, [timer, status, meter, btn, hint, skip]));

  ui = { timer, status, meter, bars, btn, hint };

  const setLevel = (l) => {
    const n = bars.length, mid = (n - 1) / 2;
    for (let i = 0; i < n; i++) {
      const dist = Math.abs(i - mid) / mid;
      const h = 6 + Math.max(0, l * 56 * (1 - dist * 0.55)) * (0.55 + Math.random() * 0.7);
      bars[i].style.height = Math.min(56, h) + "px";
    }
  };
  const resetMeter = () => bars.forEach((b) => (b.style.height = "6px"));

  const enterRecordingUI = () => {
    btn.classList.add("is-recording");
    btn.setAttribute("aria-label", "Stop recording");
    status.textContent = "● Recording";
    status.classList.add("live");
    hint.textContent = "Tap the button to stop. The screen stays awake automatically.";
  };

  async function startRec() {
    rec = new Recorder();
    rec.onTick = (s) => (timer.textContent = fmtDuration(s));
    rec.onLevel = setLevel;
    try {
      await rec.start();
    } catch (e) {
      rec = null;
      toast("Microphone permission is needed to record.", "error");
      return;
    }
    enterRecordingUI();
  }

  async function stopRec() {
    const result = await rec.stop();
    rec = null;
    btn.classList.remove("is-recording");
    btn.setAttribute("aria-label", "Start recording");
    status.classList.remove("live");
    resetMeter();
    timer.textContent = "0:00";
    status.textContent = "Ready to record";

    if (!result || !result.blob || result.blob.size === 0) {
      toast("Nothing was recorded.", "error");
      return;
    }
    if (result.interrupted) toast("The app went to the background while recording — some audio may be missing.", "error");
    await sermonDetailsModal(result, onSaved);
  }

  btn.addEventListener("click", () => (rec ? stopRec() : startRec()));

  // If a recording is already running (e.g. user switched tabs and came back),
  // re-bind the live UI to it instead of starting fresh.
  if (rec && rec.state === "recording") {
    rec.onTick = (s) => (timer.textContent = fmtDuration(s));
    rec.onLevel = setLevel;
    timer.textContent = fmtDuration(rec.elapsed);
    enterRecordingUI();
  }
}

async function sermonDetailsModal(result, onSaved) {
  const title = el("input", { type: "text", placeholder: "e.g. The Prodigal Son", autocapitalize: "words" });
  const kind = el("input", { type: "text", value: "Sermon", list: "sn-kinds", autocapitalize: "words", placeholder: "What is this?" });
  const kindList = el("datalist", { id: "sn-kinds" },
    ["Sermon", "Bible study", "Sunday school", "Conference", "Devotional", "Other"].map((v) => el("option", { value: v })));
  const speakers = [...new Set((await listSermons()).map((s) => s.speaker).filter(Boolean))];
  const speaker = el("input", { type: "text", list: "sn-speakers", autocapitalize: "words", placeholder: "Who taught it?" });
  const speakerList = el("datalist", { id: "sn-speakers" }, speakers.map((v) => el("option", { value: v })));
  const date = el("input", { type: "date", value: todayISO() });
  const body = el("div", { class: "stack" }, [
    el("div", {}, [el("label", { class: "field", text: "Title" }), title]),
    el("div", {}, [el("label", { class: "field", text: "Type" }), kind, kindList]),
    el("div", {}, [el("label", { class: "field", text: "Speaker" }), speaker, speakerList]),
    el("div", {}, [el("label", { class: "field", text: "Date" }), date]),
    el("p", { class: "small muted", text: `Recorded ${fmtDuration(result.durationSec)} of audio.` }),
  ]);
  const data = await modal({
    title: "Save recording",
    body,
    dismissable: false,
    actions: [
      { label: "Discard", class: "ghost", value: null },
      {
        label: "Save", class: "primary",
        validate: () => { if (!title.value.trim()) { title.focus(); toast("Add a title first.", "error"); return false; } },
        value: () => ({ title: title.value.trim(), kind: kind.value.trim() || "Sermon", speaker: speaker.value.trim(), date: date.value || todayISO() }),
      },
    ],
  });
  if (!data) return; // discarded
  const sermon = await createSermon({
    ...data, attended: true,
    blob: result.blob, mimeType: result.mimeType, durationSec: result.durationSec,
  });
  toast("Saved.", "success");
  onSaved && onSaved(sermon);
}

async function notAttendingModal(onSaved) {
  const date = el("input", { type: "date", value: todayISO() });
  const ok = await modal({
    title: "Not attending",
    body: el("div", { class: "stack" }, [
      el("p", { class: "muted small", text: "Marks this week as skipped. Daily sermon quizzes pause until your next recording." }),
      el("div", {}, [el("label", { class: "field", text: "Date" }), date]),
    ]),
    actions: [
      { label: "Cancel", class: "ghost", value: false },
      { label: "Mark skipped", class: "primary", value: () => date.value || todayISO() },
    ],
  });
  if (!ok) return;
  const sermon = await createSermon({ title: "(Not attending)", date: ok, attended: false });
  toast("Marked as not attending.");
  onSaved && onSaved(sermon);
}
