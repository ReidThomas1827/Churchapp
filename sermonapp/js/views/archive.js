import { el, clear, toast, confirmDialog, fmtDate, fmtDuration, chevron, spinnerRow } from "../ui.js";
import { listSermons, getSermon, getAudio, saveSermon, deleteSermon, dropAudio } from "../store.js";
import { transcribe, generateNotes, embedSermon } from "../api.js";
import { exportPDF, exportDOCX } from "../export.js";
import { openQuiz } from "./quiz.js";

const STATUS = {
  recorded: { label: "Recorded", cls: "accent" },
  transcribing: { label: "Transcribing…", cls: "warn" },
  transcribed: { label: "Transcribed", cls: "good" },
  noting: { label: "Writing notes…", cls: "warn" },
  noted: { label: "Notes ready", cls: "good" },
  skipped: { label: "Not attending", cls: "warn" },
  error: { label: "Error", cls: "warn" },
};

export async function renderArchive(root) {
  clear(root);
  const sermons = await listSermons();
  if (!sermons.length) {
    root.appendChild(el("div", { class: "empty" }, [
      el("div", { html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7h16M4 7l1 13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>' }),
      el("div", { text: "No sermons yet." }),
      el("div", { class: "small", text: "Record one from the Record tab." }),
    ]));
    return;
  }
  const ul = el("ul", { class: "list" });
  for (const s of sermons) {
    const st = STATUS[s.status] || STATUS.recorded;
    ul.appendChild(el("li", {
      class: "list-item", role: "button",
      onClick: () => renderDetail(root, s.id),
    }, [
      el("div", {}, [
        el("div", { class: "ttl", text: s.title }),
        el("div", { class: "sub", text: (s.attended === false ? "" : (s.kind || "Sermon") + " · ") + fmtDate(s.date) + (s.durationSec ? " · " + fmtDuration(s.durationSec) : "") }),
      ]),
      el("div", { class: "row" }, [el("span", { class: "tag " + st.cls, text: st.label }), chevron()]),
    ]));
  }
  root.appendChild(ul);
}

function renderNotes(notes) {
  if (!notes) return null;
  if (notes.raw) return el("div", { class: "notes" }, el("p", { text: notes.raw }));
  const wrap = el("div", { class: "notes stack" });
  if (notes.summary) wrap.append(el("p", { text: notes.summary }));
  if (Array.isArray(notes.scriptures) && notes.scriptures.length)
    wrap.append(el("p", { class: "small muted", text: "Scriptures: " + notes.scriptures.join(", ") }));
  for (const sec of notes.sections || []) {
    wrap.append(el("h3", { text: sec.heading || "Notes", style: "font-size:15px" }));
    wrap.append(el("ul", {}, (sec.points || []).map((p) => el("li", { text: p }))));
  }
  if (Array.isArray(notes.takeaways) && notes.takeaways.length) {
    wrap.append(el("h3", { text: "Takeaways", style: "font-size:15px" }));
    wrap.append(el("ul", {}, notes.takeaways.map((t) => el("li", { text: t }))));
  }
  return wrap;
}

async function renderDetail(root, id) {
  clear(root);
  const s = await getSermon(id);
  if (!s) return renderArchive(root);
  const refresh = () => renderDetail(root, id);

  const back = el("button", { class: "btn ghost", style: "width:auto;margin-bottom:14px", onClick: () => renderArchive(root) }, "‹ Back");
  const st = STATUS[s.status] || STATUS.recorded;
  const head = el("div", { class: "stack" }, [
    el("h2", { text: s.title }),
    el("div", { class: "row" }, [
      el("span", { class: "tag " + st.cls, text: st.label }),
      s.attended === false ? null : el("span", { class: "tag", text: s.kind || "Sermon" }),
      el("span", { class: "small muted", text: fmtDate(s.date) }),
    ]),
  ]);

  const actions = el("div", { class: "stack" });

  // Audio playback
  const blob = await getAudio(id);
  if (blob) {
    const url = URL.createObjectURL(blob);
    actions.append(el("audio", { controls: "", src: url, style: "width:100%;margin-top:6px" }));
    if (s.transcript) {
      actions.append(el("button", {
        class: "btn ghost", style: "width:auto",
        onClick: async () => {
          if (await confirmDialog("Remove audio?", "Frees space on this device. The transcript and notes are kept.", { confirmLabel: "Remove" })) {
            await dropAudio(id); toast("Audio removed."); refresh();
          }
        },
      }, "Remove audio to free space"));
    }
  }

  // Transcribe
  if (s.attended && !s.transcript) {
    const tBtn = el("button", { class: "btn primary" }, "Transcribe audio");
    tBtn.addEventListener("click", async () => {
      if (!blob) return toast("No audio stored for this sermon.", "error");
      tBtn.replaceWith(spinnerRow("Transcribing — this can take a minute…"));
      s.status = "transcribing"; await saveSermon(s);
      try {
        const { transcript } = await transcribe(blob, s.mimeType);
        s.transcript = transcript || ""; s.status = "transcribed"; await saveSermon(s);
        toast("Transcribed.", "success");
      } catch (e) {
        s.status = "recorded"; await saveSermon(s);
        toast(e.status === 501 ? "Add your Deepgram key in Settings first." : (e.message || "Transcription failed."), "error");
      }
      refresh();
    });
    actions.append(tBtn);
  }

  // Generate notes
  if (s.transcript && !s.notes) {
    const nBtn = el("button", { class: "btn primary" }, "Generate study notes");
    nBtn.addEventListener("click", async () => {
      nBtn.replaceWith(spinnerRow("Writing notes…"));
      s.status = "noting"; await saveSermon(s);
      try {
        const { notes } = await generateNotes(s.transcript);
        s.notes = notes; s.status = "noted"; await saveSermon(s);
        embedSermon({ sermonId: s.id, title: s.title, transcript: s.transcript, notes }).catch(() => {});
        toast("Notes ready.", "success");
      } catch (e) {
        s.status = "transcribed"; await saveSermon(s);
        toast(e.status === 501 ? "Add your Gemini key in Settings first." : (e.message || "Couldn't generate notes."), "error");
      }
      refresh();
    });
    actions.append(nBtn);
  }

  if (s.transcript) {
    actions.append(el("button", { class: "btn", onClick: () => openQuiz({ type: "sermon", title: s.title, transcript: s.transcript }) }, "Quiz me on this"));
  }

  // Notes + transcript display
  const content = el("div", { class: "stack" });
  if (s.notes) content.append(el("div", { class: "card" }, [el("h3", { text: "Notes" }), renderNotes(s.notes)]));
  if (s.transcript) content.append(el("div", { class: "card" }, [el("h3", { text: "Transcript" }), el("div", { class: "transcript", text: s.transcript })]));

  // Export + delete
  const exportRow = el("div", { class: "btn-row" }, [
    el("button", { class: "btn", onClick: () => exportPDF(s).catch((e) => toast(e.message || "Export failed", "error")) }, "Export PDF"),
    el("button", { class: "btn", onClick: () => exportDOCX(s).catch((e) => toast(e.message || "Export failed", "error")) }, "Export Word"),
  ]);
  const delBtn = el("button", {
    class: "btn danger",
    onClick: async () => {
      if (await confirmDialog("Delete sermon?", "This removes the recording, transcript, and notes. This can't be undone.", { danger: true, confirmLabel: "Delete" })) {
        await deleteSermon(id);
        toast("Deleted.");
        renderArchive(root);
      }
    },
  }, "Delete");

  root.append(back, head, el("hr", { class: "sep" }), actions,
    (s.notes || s.transcript) ? content : el("p", { class: "muted small", text: s.attended ? "Transcribe the audio to unlock notes, quizzes, and export." : "This week was marked as not attending." }),
    el("hr", { class: "sep" }), s.attended ? exportRow : null, delBtn);
}
